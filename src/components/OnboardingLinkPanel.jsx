import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { copyText } from '../lib/intakeSummary'

// Creates and shows the client's onboarding link. This is the delivery half of
// the self-service onboarding: without a link to send, the forms are just two
// more screens only staff can see.
//
// One live link per client. Generating a new one revokes the old, so a link
// forwarded to the wrong person can be killed by making a fresh one.
export default function OnboardingLinkPanel({ client }) {
  const [link, setLink] = useState(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(null)

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

  const url = link ? `${window.location.origin}/onboarding/${link.token}` : ''

  const handleCopy = async () => {
    const ok = await copyText(url)
    setCopied(ok ? 'ok' : 'fail')
    setTimeout(() => setCopied(null), 2000)
  }

  if (loading) return <p className="text-sm text-slate-500">Loading onboarding link...</p>

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-bold text-slate-900">Client onboarding link</h3>
        <p className="text-xs text-slate-500">
          Send this to the client so they fill in their own onboarding and GHL setup details.
        </p>
      </div>

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">{error}</div>
      )}

      {link ? (
        <>
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
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
