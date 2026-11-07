import { useEffect, useState } from 'react'
import { ChannelDot, DarkButton, Panel, Pill, SectionTitle } from './reports/kit'
import { dashboardLink, newToken } from '../lib/clientDashboard'
import { cleanPublicUrl, getPublicAppUrl } from '../lib/publicSite'
import { loadPublicAppUrl, savePublicAppUrl } from '../lib/publicSiteStore'
import { supabase } from '../lib/supabaseClient'

/**
 * The address every client link goes out on ("can we change the URL of
 * this CRM when we send out links"). Saved in app_settings; the dashboard,
 * report, approval, onboarding, scripts and videos links the CRM makes, and
 * the weekly report emails, carry it from then on. The domain itself has
 * to be added to the site in Netlify first; that is the one step this box
 * cannot do.
 */
function LinkAddressRow({ onChange }) {
  const [saved, setSaved] = useState(getPublicAppUrl())
  const [draft, setDraft] = useState(getPublicAppUrl())
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    loadPublicAppUrl()
      .then((v) => {
        setSaved(v)
        setDraft(v)
      })
      .catch(() => {})
  }, [])

  const here = typeof window !== 'undefined' ? window.location.origin : ''
  const save = async () => {
    setBusy(true)
    setNote('')
    try {
      const v = await savePublicAppUrl(draft)
      setSaved(v)
      setDraft(v)
      setEditing(false)
      setNote(v ? `Saved. Every link copied from now on starts with ${v}.` : 'Cleared. Links use this site’s own address again.')
      onChange?.(v)
    } catch (err) {
      setNote(err.message)
    } finally {
      setBusy(false)
    }
  }
  const preview = cleanPublicUrl(draft)

  return (
    <Panel className="mb-3 p-4" data-link-address>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="text-slate-400">Links go out on</span>
        {editing ? (
          <>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !busy && save()}
              placeholder="clients.yourdomain.com"
              aria-label="The address client links go out on"
              className="w-72 max-w-full rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 font-mono text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
              data-link-address-input
            />
            <DarkButton onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </DarkButton>
            <button
              type="button"
              onClick={() => {
                setDraft(saved)
                setEditing(false)
                setNote('')
              }}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            {draft.trim() && !preview && <span className="text-xs text-amber-300">Not a web address yet.</span>}
          </>
        ) : (
          <>
            <span className="font-mono text-xs text-white" data-link-address-value>
              {saved || here}
            </span>
            {!saved && <span className="text-xs text-slate-500">(this site’s own address)</span>}
            <DarkButton onClick={() => setEditing(true)}>{saved ? 'Change' : 'Use our own domain'}</DarkButton>
          </>
        )}
      </div>
      {note && <p className="mt-2 text-xs text-emerald-300" data-link-address-note>{note}</p>}
      <details className="mt-2 text-xs text-slate-500">
        <summary className="cursor-pointer hover:text-slate-300">How to put the links on our own domain</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>In Netlify, open this site, Domain management, add the domain (clients.yourdomain.com or the like) and point its DNS where Netlify says. Wait for the padlock.</li>
          <li>Open the domain in a browser: the CRM should load there too (it is the same site).</li>
          <li>Put the domain here and Save. Every link copied from then on, every onboarding message and every weekly report email uses it. Links already sent keep working on the old address.</li>
        </ol>
        <p className="mt-2">To make the new domain serve only the client pages (no CRM there at all), say so and the domain goes into the site’s edge rules as well.</p>
      </details>
    </Panel>
  )
}

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
  // Bumped when the link address changes, so the cards re-read their links.
  const [, setLinkBase] = useState('')

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
      <LinkAddressRow onChange={setLinkBase} />
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
