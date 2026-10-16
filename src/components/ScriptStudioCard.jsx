import { useEffect, useState } from 'react'
import { askLabel, scriptsSummary } from '../../supabase/functions/_shared/scriptStudio.js'
import { fetchClientScripts, scriptsLink } from '../lib/scriptStudioStore'

const STATUS = { new: ['Ready', 'bg-orange-100 text-orange-900'], saved: ['Ready', 'bg-orange-100 text-orange-900'], filmed: ['Filmed', 'bg-green-100 text-green-900'], archived: ['Set aside', 'bg-slate-100 text-slate-500'] }
const when = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/**
 * The client's Video Script Studio, from the CRM side: the private link to
 * send them (the same token as their dashboard), what they have written,
 * what they say they filmed, and how they say they talk. The page itself
 * is /scripts/<token>; see docs/script-studio.md.
 */
export default function ScriptStudioCard({ client }) {
  const [rows, setRows] = useState(null)
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(null)
  const link = client?.dashboard_token ? scriptsLink(client.dashboard_token) : ''

  useEffect(() => {
    let cancelled = false
    fetchClientScripts(client.id)
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setRows([]))
    return () => {
      cancelled = true
    }
  }, [client.id])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // The input below is selectable.
    }
  }
  const filmed = (rows || []).filter((r) => r.status === 'filmed')
  const voice = client?.voice_profile || {}

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5" data-script-studio-card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Video scripts for {client.name}</h3>
          <p className="text-sm text-slate-500">
            Their own page: three picks for the week, one tap writes a script from their brief and what is working, a teleprompter, one-tap rewrites. {rows ? scriptsSummary(rows) : 'Loading…'}
          </p>
        </div>
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800" data-scripts-open>
            Open their page
          </a>
        )}
      </div>

      {link ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input readOnly value={link} onFocus={(e) => e.target.select()} className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700" data-scripts-link-box />
          <button type="button" onClick={copy} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" data-scripts-copy>
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-amber-800">This client has no dashboard link yet, and the scripts page uses the same one. Make one on the Reports page (Client dashboards) first.</p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        One link, two tabs: their numbers and their video scripts are the same private page, and this address opens it on the scripts tab (the
        &ldquo;Client dashboard&rdquo; link in the header opens it on the numbers). Send either by text; there is nothing to remember and nothing to log in to.
        {filmed.length > 0 && ` They have marked ${filmed.length} filmed: ask for the video${filmed.length === 1 ? '' : 's'} if it has not landed in their Drive folder.`}
      </p>

      {(voice.goes_by || voice.tone || voice.avoid || voice.sign_off) && (
        <p className="mt-2 text-xs text-slate-600">
          <span className="font-medium">How they say they talk:</span> {[voice.goes_by && `goes by ${voice.goes_by}`, voice.tone, voice.avoid && `never says ${voice.avoid}`, voice.sign_off && `signs off "${voice.sign_off}"`].filter(Boolean).join(' · ')}
        </p>
      )}

      {rows && rows.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {rows.slice(0, 8).map((r) => {
            const [label, style] = STATUS[r.status] || STATUS.new
            const isOpen = open === r.id
            return (
              <li key={r.id} className="px-3 py-2 text-sm" data-script-row={r.id}>
                <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} className="flex w-full items-center gap-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{r.script?.title || r.script?.hook}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {askLabel(r.ask)} · {when(r.created_at)}
                      {r.made_by === 'agency' ? ' · written here' : ''}
                    </span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${style}`}>{label}</span>
                </button>
                {isOpen && (
                  <ol className="mt-2 space-y-1 text-xs text-slate-700">
                    {(r.script?.lines || []).map((l, i) => (
                      <li key={i}>
                        {i + 1}. {l.say}
                      </li>
                    ))}
                    {r.script?.caption && <li className="pt-1 text-slate-500">Caption: {r.script.caption}</li>}
                  </ol>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
