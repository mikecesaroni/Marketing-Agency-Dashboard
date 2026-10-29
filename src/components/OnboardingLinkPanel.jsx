import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { copyText } from '../lib/intakeSummary'
import { onboardingMessage } from '../lib/onboardingMessage'
import { publicLink } from '../lib/publicSite'

// Creates and shows the client's onboarding link. This is the delivery half of
// the self-service onboarding: without a link to send, the forms are just two
// more screens only staff can see.
//
// One live link per client. Generating a new one revokes the old, so a link
// forwarded to the wrong person can be killed by making a fresh one.
//
// `fixedMode` is how this is normally opened now. It used to carry its own
// which-halves selector, sitting behind a Send button that had nothing to do
// with the two form buttons beside it -- so picking what to send happened in a
// different place from looking at what was in it. Opened from a form's own Send
// button, the mode is already decided by which form you were looking at, and a
// selector would only be a chance to contradict yourself.
export default function OnboardingLinkPanel({ client, fixedMode }) {
  const [link, setLink] = useState(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(null)
  const [copiedMsg, setCopiedMsg] = useState(null)
  // Which halves to send. Not every client is doing the account setup side
  // with us, and marching one of those through a form full of EIN and
  // registration questions is a good way to lose them.
  const [mode, setMode] = useState(fixedMode || 'both')

  const load = async () => {
    const { data, error: readError } = await supabase
      .from('onboarding_links')
      .select('*')
      .eq('client_id', client.id)
      .eq('revoked', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (readError) setError(readError.message)
    setLink(data || null)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id])

  const generate = async () => {
    setWorking(true)
    setError('')
    try {
      if (link) {
        const { error: revokeError } = await supabase
          .from('onboarding_links')
          .update({ revoked: true })
          .eq('id', link.id)
        if (revokeError) throw revokeError
      }

      // token, created_at and id all come from column defaults.
      const { data, error: insertError } = await supabase
        .from('onboarding_links')
        .insert({ client_id: client.id })
        .select()
        .single()

      if (insertError) throw insertError
      setLink(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setWorking(false)
    }
  }

  const url = link ? publicLink(`/onboarding/${link.token}`) : ''

  // One token, three ways in. The bare URL keeps meaning both forms, because
  // links already sent carry no parameter and have to keep behaving the way
  // their recipient was told they would.
  const MODES = {
    both: { param: '', label: 'The onboarding form' },
    intake: { param: '?form=intake', label: 'Without the account step' },
    ghl: { param: '?form=ghl', label: 'Account step only' },
  }
  const activeUrl = url ? `${url}${MODES[mode].param}` : ''

  /**
   * The whole message, ready to paste into an email or a text: the form link
   * and the Drive folder WE made for them (linked on the client page under
   * Files), in the owner's words (src/lib/onboardingMessage.js). Copying the
   * bare URL left the things a client has to be told unwritten, and they were
   * being retyped from memory every time.
   */
  const message = useMemo(
    () => onboardingMessage({ url: activeUrl, mode, driveFolderId: client.drive_folder_id || '', clientName: client.name }),
    [activeUrl, mode, client.name, client.drive_folder_id]
  )

  const handleCopy = async () => {
    const ok = await copyText(activeUrl)
    setCopied(ok ? 'ok' : 'fail')
    setTimeout(() => setCopied(null), 2000)
  }

  const handleCopyMessage = async () => {
    const ok = await copyText(message)
    setCopiedMsg(ok ? 'ok' : 'fail')
    setTimeout(() => setCopiedMsg(null), 2000)
  }

  if (loading) return <p className="text-sm text-slate-500">Loading onboarding link...</p>

  return (
    <div className="space-y-3">
      {!fixedMode && (
        <div>
          <h3 className="font-bold text-slate-900">Client onboarding link</h3>
          <p className="text-xs text-slate-500">
            Send this to the client so they fill in their own onboarding and GHL setup details.
          </p>
        </div>
      )}

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">{error}</div>
      )}

      {link ? (
        <>
          {!fixedMode && (
          <div className="flex flex-wrap gap-1">
            {Object.entries(MODES).map(([key, m]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  mode === key
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          )}
          <p className="text-[11px] text-slate-500">
            {mode === 'both'
              ? 'One form in seven short steps: business, area, services, why them, leads, photos, then the account details (EIN, address). This is the link to send every new client.'
              : mode === 'intake'
                ? 'Everything except the account step. Only for a client not on GHL.'
                : 'Opens straight on the account step. Send when the rest is already in.'}
          </p>

          <div className="flex gap-2">
            <input
              readOnly
              value={activeUrl}
              onFocus={(e) => e.target.select()}
              className="flex-1 px-2 py-1 border rounded text-xs bg-slate-50 font-mono"
            />
            <button
              type="button"
              onClick={handleCopy}
              className={`px-3 py-1 rounded text-sm font-medium transition flex-shrink-0 ${
                copied === 'ok'
                  ? 'bg-green-600 text-white'
                  : copied === 'fail'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {copied === 'ok' ? '✓' : 'Copy'}
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1 gap-2">
              <label className="text-xs font-medium text-slate-600">
                Message to send
              </label>
              <button
                type="button"
                onClick={handleCopyMessage}
                className={`px-2 py-1 rounded text-xs font-medium transition flex-shrink-0 ${
                  copiedMsg === 'ok'
                    ? 'bg-green-600 text-white'
                    : copiedMsg === 'fail'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {copiedMsg === 'ok' ? '\u2713 Copied' : 'Copy message'}
              </button>
            </div>
            <textarea
              readOnly
              value={message}
              rows={14}
              onFocus={(e) => e.target.select()}
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-[11px] font-mono bg-slate-50 leading-relaxed resize-y"
            />
            {mode !== 'ghl' && !client.drive_folder_id && (
              <p className="text-[11px] text-amber-700 mt-1" data-no-drive-folder>
                No Drive folder linked yet, so the message has a placeholder where the folder link
                goes. Make the folder in Google Drive, share it with the client (Anyone with the
                link, Editor), then link it on this client&rsquo;s page under Files, and the link
                fills in here.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            <span>
              Onboarding form:{' '}
              <strong className={link.intake_submitted_at ? 'text-green-700' : 'text-slate-400'}>
                {link.intake_submitted_at
                  ? new Date(link.intake_submitted_at).toLocaleDateString()
                  : 'not submitted'}
              </strong>
            </span>
            <span>
              GHL setup form:{' '}
              <strong className={link.ghl_submitted_at ? 'text-green-700' : 'text-slate-400'}>
                {link.ghl_submitted_at
                  ? new Date(link.ghl_submitted_at).toLocaleDateString()
                  : 'not submitted'}
              </strong>
            </span>
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">No link yet.</p>
      )}

      <button
        type="button"
        onClick={generate}
        disabled={working}
        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
      >
        {working ? 'Working...' : link ? 'Replace link' : 'Create link'}
      </button>
      {link && (
        <p className="text-xs text-slate-400">Replacing invalidates the link already sent.</p>
      )}
    </div>
  )
}
