import { useEffect, useState } from 'react'
import { ChannelDot, DarkButton, Panel, Pill, SectionTitle } from './reports/kit'
import { dashboardLink, newToken } from '../lib/clientDashboard'
import { supabase } from '../lib/supabaseClient'

/**
 * One card per client with their private dashboard link. Lives on the
 * Reports page. Open it, copy it, or make a new one (the old link stops
 * working, for when a link has gone somewhere it should not have).
 */
export default function ClientDashboardsPanel() {
  const [clients, setClients] = useState([])
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [confirmId, setConfirmId] = useState('')

  useEffect(() => {
    supabase
      .from('clients')
      .select('id, name, archived, is_internal, paused_at, dashboard_token, meta_ad_account_id, google_ads_customer_id')
      .eq('archived', false)
      .eq('is_internal', false)
      .order('name')
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else setClients(data || [])
      })
  }, [])

  const copy = async (c) => {
    const link = dashboardLink(c.dashboard_token)
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      window.prompt('Copy this link', link)
    }
    setCopied(c.id)
    setTimeout(() => setCopied(''), 1800)
  }

  // A missing token (a client added before the column existed) and a
  // replaced one are the same write.
  const setToken = async (c) => {
    const token = newToken()
    const { error: err } = await supabase.from('clients').update({ dashboard_token: token }).eq('id', c.id)
    if (err) {
      setError(err.message)
      return
    }
    setConfirmId('')
    setClients((cs) => cs.map((x) => (x.id === c.id ? { ...x, dashboard_token: token } : x)))
  }

  return (
    <section data-client-dashboards>
      <SectionTitle title="Client dashboards" sub="One private link per client: every number, what it means, and why return beats cost per lead. Send it once; it stays live." />
      {error && <p className="mb-3 text-sm text-rose-300">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {clients.map((c) => {
          const link = c.dashboard_token ? dashboardLink(c.dashboard_token) : ''
          return (
            <Panel key={c.id} className="p-4" data-dashboard-card={c.name}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-white">{c.name}</p>
                {c.paused_at && <Pill tone="warning">Paused</Pill>}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
                {c.meta_ad_account_id && (
                  <span className="inline-flex items-center gap-1.5">
                    <ChannelDot channel="meta" />
                    Meta
                  </span>
                )}
                {c.google_ads_customer_id && (
                  <span className="inline-flex items-center gap-1.5">
                    <ChannelDot channel="google" />
                    Google
                  </span>
                )}
                {!c.meta_ad_account_id && !c.google_ads_customer_id && <span className="text-slate-500">No ad account linked yet</span>}
              </div>
              {link ? (
                <p className="mt-3 truncate font-mono text-[11px] text-slate-500" title={link}>
                  {link}
                </p>
              ) : (
                <p className="mt-3 text-[11px] text-slate-500">No link yet.</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {link && (
                  <a href={link} target="_blank" rel="noreferrer" className="whitespace-nowrap rounded-xl bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition hover:bg-slate-200">
                    Open
                  </a>
                )}
                {link && <DarkButton onClick={() => copy(c)}>{copied === c.id ? '✓ Copied' : 'Copy link'}</DarkButton>}
                {!link ? (
                  <DarkButton onClick={() => setToken(c)}>Make link</DarkButton>
                ) : confirmId === c.id ? (
                  <span className="flex flex-wrap items-center gap-2 text-xs text-amber-200">
                    The old link stops working.
                    <DarkButton onClick={() => setToken(c)} aria-label={`Make a new dashboard link for ${c.name}`}>
                      Yes, new link
                    </DarkButton>
                    <button type="button" onClick={() => setConfirmId('')} className="text-slate-400 hover:text-white">
                      Keep it
                    </button>
                  </span>
                ) : (
                  <DarkButton onClick={() => setConfirmId(c.id)} title="Replace the link; the old one stops working">
                    New link
                  </DarkButton>
                )}
              </div>
            </Panel>
          )
        })}
      </div>
    </section>
  )
}
