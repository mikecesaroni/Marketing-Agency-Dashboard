import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { copyText } from '../lib/intakeSummary'
import { driveServiceAccount } from '../lib/driveAssets'

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
  const [serviceEmail, setServiceEmail] = useState('')

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

  // Who the client should share their photo folder with. Fetched rather than
  // hardcoded so rotating the service account does not silently leave the
  // wrong address in every message we send.
  useEffect(() => {
    driveServiceAccount()
      .then(setServiceEmail)
      // Without it the message just omits the Drive step rather than telling a
      // client to share a folder with nobody.
      .catch(() => setServiceEmail(''))
  }, [])

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

  const url = link ? `${window.location.origin}/onboarding/${link.token}` : ''

  // One token, three ways in. The bare URL keeps meaning both forms, because
  // links already sent carry no parameter and have to keep behaving the way
  // their recipient was told they would.
  const MODES = {
    both: { param: '', label: 'Onboarding + GHL setup' },
    intake: { param: '?form=intake', label: 'Onboarding only' },
    ghl: { param: '?form=ghl', label: 'GHL setup only' },
  }
  const activeUrl = url ? `${url}${MODES[mode].param}` : ''

  /**
   * The whole message, ready to paste into an email or a text.
   *
   * Copying the bare URL left the two things a client has to be told
   * unwritten: that the form saves as you go, and that we need a Drive folder
   * rather than photos attached to a reply. Both were being retyped from
   * memory every time, which is how one of them ends up left out.
   *
   * The folder link is asked for explicitly. Sharing the folder grants us
   * access but tells us nothing about where it is -- without the link back
   * there is no folder ID to put in the CRM, and the share sits unused.
   */
  const message = useMemo(() => {
    if (!activeUrl) return ''

    // The account setup on its own is a different ask to a different person on
    // a different day: it is registration paperwork, not "tell us about your
    // business", and none of the photo instructions belong anywhere near it.
    if (mode === 'ghl') {
      return [
        `Hi ${client.name} team,`,
        '',
        'To get your account and text messaging set up, we need a few details off',
        'your business registration -- your EIN, business address and who the',
        'authorised contact is.',
        '',
        activeUrl,
        '',
        'It saves as you go, so you can stop and come back if you need to look',
        'something up.',
        '',
        'Thanks!',
      ].join('\n')
    }

    const lines = [
      `Hi ${client.name} team,`,
      '',
      'Two quick things and we can get your ads moving.',
      '',
      '1) Your onboarding details:',
      activeUrl,
      'It saves as you go, so you can stop and come back to it.',
    ]

    // Said out loud only when it is true. The onboarding-only link ends at the
    // end of the onboarding, and promising a second part that never arrives is
    // its own small broken promise.
    if (mode === 'both') {
      lines.push('There is a short account setup section after it.')
    }

    if (serviceEmail) {
      lines.push(
        '',
        '2) Photos for your ads. Make one folder in Google Drive with your best',
        'job photos, your logo and any team pictures. Then share that folder with:',
        '',
        `    ${serviceEmail}`,
        '',
        'Set it to "Viewer" and send. Google may warn that it is not a regular',
        'Google account -- that is expected, it is our system, and Viewer means we',
        'can only look at the folder, never change or delete anything in it.',
        '',
        'Then reply with the folder link (Share > Copy link) so we can connect it.',
        '',
        'After that, anything you drop into that folder we can use in your ads',
        'straight away -- no emailing pictures back and forth.'
      )
    }

    lines.push('', 'Thanks!')
    return lines.join('\n')
  }, [activeUrl, mode, client.name, serviceEmail])

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
              ? 'Both forms, the onboarding first. This is what the plain link has always done.'
              : mode === 'intake'
                ? 'The onboarding on its own, finishing at the end of it. For clients not doing the account setup side with us.'
                : 'Opens straight on the account setup. Send when the onboarding is already done.'}
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
            {!serviceEmail && (
              <p className="text-[11px] text-amber-700 mt-1">
                The Drive folder step is missing because the service account address could
                not be read. Deploy drive-assets and set GOOGLE_SERVICE_ACCOUNT_JSON, or
                add the folder request to the message by hand.
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
