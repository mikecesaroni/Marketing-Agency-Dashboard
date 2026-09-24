import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { copyText } from '../lib/intakeSummary'
import { driveServiceAccount } from '../lib/driveAssets'
import { AGENCY_EMAIL } from '../lib/agencyEmail'
import { ACCESS_EMAIL, buildMetaSetupMessage } from '../lib/metaSetupMessage'
import { buildLsaSetupMessage } from '../lib/lsaSetupMessage'
import { buildGbpSetupMessage } from '../lib/gbpSetupMessage'
import { Card } from './ui'

/**
 * The things the team pastes into other people's screens all day, one click
 * each, on the dashboard.
 *
 * Every one of these already lived somewhere: the portfolio ID in
 * app_settings, the Drive service account behind an Ad Studio tab, the three
 * access messages on the channel panels and a client's Next-up bar. Reaching
 * any of them meant knowing where it was, which is fine for one person and
 * not for a team. Same sources, same builders, so nothing here can drift
 * from what the rest of the app says.
 */

function CopyButton({ text, label = 'Copy', disabled }) {
  const [state, setState] = useState(null)
  const go = async () => {
    const ok = await copyText(text)
    setState(ok ? 'ok' : 'fail')
    setTimeout(() => setState(null), 1800)
  }
  return (
    <button
      type="button"
      onClick={go}
      disabled={disabled || !text}
      className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
        state === 'ok'
          ? 'bg-green-600 text-white'
          : state === 'fail'
            ? 'bg-red-100 text-red-700'
            : 'bg-slate-900 text-white hover:bg-slate-800'
      }`}
    >
      {state === 'ok' ? '✓ Copied' : state === 'fail' ? 'Copy failed' : label}
    </button>
  )
}

function ValueRow({ label, value, hint, loading }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="truncate font-mono text-sm text-slate-900" title={value || ''}>
          {loading ? <span className="text-slate-400">Loading…</span> : value || <span className="font-sans text-slate-400">{hint || 'Not set'}</span>}
        </p>
      </div>
      <CopyButton text={value} disabled={loading || !value} />
    </div>
  )
}

function MessageRow({ label, blurb, text, warn }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="py-2">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{label}</p>
          <p className="text-xs text-slate-500">{blurb}</p>
          {warn && <p className="mt-0.5 text-[11px] text-amber-700">{warn}</p>}
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex-shrink-0 text-xs text-slate-500 hover:text-slate-900 hover:underline">
          {open ? 'hide' : 'preview'}
        </button>
        <CopyButton text={text} label="Copy message" />
      </div>
      {open && <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{text}</pre>}
    </div>
  )
}

export default function QuickCopyPanel() {
  const [businessId, setBusinessId] = useState(null)
  const [driveEmail, setDriveEmail] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'meta_business_id')
      .maybeSingle()
      .then(({ data }) => !cancelled && setBusinessId(String(data?.value || '').trim()))
      .catch(() => !cancelled && setBusinessId(''))
    driveServiceAccount()
      .then((email) => !cancelled && setDriveEmail(email || ''))
      .catch(() => !cancelled && setDriveEmail(''))
    return () => {
      cancelled = true
    }
  }, [])

  const metaMessage = buildMetaSetupMessage(businessId || '')

  return (
    <Card className="mb-6 md:mb-8" padding="lg">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Quick copy</p>
        <p className="text-[11px] text-slate-400">The IDs, emails and access messages the team pastes most.</p>
      </div>
      <div className="grid gap-x-8 md:grid-cols-2">
        <div className="divide-y divide-slate-100">
          <ValueRow label="Meta business portfolio ID" value={businessId} loading={businessId === null} hint="Not saved in app_settings.meta_business_id" />
          <ValueRow label="CRM Google Drive email (share folders with this)" value={driveEmail} loading={driveEmail === null} hint="Drive function did not answer" />
          <ValueRow label="Our email (LSA and GBP access)" value={AGENCY_EMAIL} />
          <ValueRow label="Meta login the client adds" value={ACCESS_EMAIL} />
        </div>
        <div className="divide-y divide-slate-100">
          <MessageRow
            label="Meta access request"
            blurb="Send to the owner. They add us on their Page and ad account."
            text={metaMessage}
            warn={businessId === '' ? 'No portfolio ID saved; the message carries a placeholder.' : null}
          />
          <MessageRow label="Google LSA access request" blurb="They verify Local Services and add us as an Admin." text={buildLsaSetupMessage()} />
          <MessageRow label="Google Business Profile access request" blurb="They add us as a manager on the profile." text={buildGbpSetupMessage()} />
        </div>
      </div>
    </Card>
  )
}
