import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import { cacheBust, cached, keys } from '../lib/pageCache'
import { fetchClientStatus, setClientTier } from '../lib/clientStatusData'
import { TIERS, TIER_BY_NUMBER, tierPrice } from '../lib/clientTiers'
import { STATE_WORDS, liveChannels, tierColumns } from '../lib/tierBoard'

/**
 * CLIENT TIERS. The three plans side by side, and under each one the names
 * of the clients on it. Nothing else on the page: it is the answer to "who
 * is on what", readable on one screen without scrolling.
 *
 * Click a name for the rest: what their plan includes, and where they stand
 * on Meta and Google right now. The plan can be changed there too.
 *
 * Until 2026-11-26 this was a board of cards with checklists, flags, views
 * and who to call ("get rid of all the bs info and just show us their
 * names", "get rid of the calling"). The flags it showed are still worked
 * out in src/lib/clientStatus.js for the morning brief and the weekly
 * status, and the launch checklist is on each client's own page.
 */

const DOT = { live: 'bg-green-500', connected: 'bg-amber-400', refused: 'bg-red-500', missing: 'bg-slate-300', stopped: 'bg-red-500', paused: 'bg-slate-300' }

/** The line under a channel: nothing when "Live" already says it, else what is running or missing. */
const sayDetail = (ch) => (ch.state === 'live' ? (ch.key === 'google' ? ch.detail.replace('Google live: ', '') : '') : ch.detail)

function NameButton({ row, onOpen }) {
  const paused = Boolean(row.client.paused_at)
  return (
    <button
      type="button"
      onClick={() => onOpen(row.client.id)}
      data-client-name
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition hover:bg-slate-100 ${paused ? 'text-slate-400' : 'font-medium text-slate-900'}`}
    >
      <span className="truncate">{row.client.name}</span>
      {paused && <span className="flex-shrink-0 text-[10px] uppercase tracking-wide">paused</span>}
    </button>
  )
}

function Details({ row, onTier, saving }) {
  const plan = TIER_BY_NUMBER[row.tier] || null
  const channels = liveChannels(row)
  return (
    <div className="space-y-5" data-client-details>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Plan</p>
        {plan ? (
          <>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {plan.name} <span className="font-normal text-slate-500">· {tierPrice(plan.tier)}</span>
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700" data-plan-includes>
              {plan.includes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-600">No plan set yet. Pick one below.</p>
        )}
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Live status</p>
        <div className="mt-2 space-y-2">
          {channels.map((ch) => (
            <div key={ch.key} className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5" data-channel={ch.key} data-state={ch.state}>
              <span className={`mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${DOT[ch.state]}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {ch.label} <span className="font-normal text-slate-600">· {STATE_WORDS[ch.state]}</span>
                </p>
                <p className="text-xs text-slate-500">{[sayDetail(ch), !ch.inPackage && plan ? 'Not part of their plan' : ''].filter(Boolean).join('. ')}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Change plan
          <select
            value={row.tier || 0}
            disabled={saving}
            onChange={(e) => onTier(row.client, Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
            data-tier-select
          >
            {!plan && <option value={0}>Not set</option>}
            {TIERS.map((t) => (
              <option key={t.tier} value={t.tier}>
                {t.short}
              </option>
            ))}
          </select>
        </label>
        <Link to={`/client/${row.client.id}`} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800">
          Open client page
        </Link>
      </div>
    </div>
  )
}

export default function ClientStatusPage() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = () =>
    cached(keys.clientStatus(), fetchClientStatus, (r) => {
      setRows(r)
      setError('')
    }).catch((err) => setError(err.message))

  useEffect(() => {
    load()
  }, [])

  const columns = useMemo(() => tierColumns(rows || []), [rows])
  const open = (rows || []).find((r) => r.client.id === openId) || null

  const changeTier = async (client, tier) => {
    setError('')
    setSaving(true)
    try {
      await setClientTier(client.id, tier)
      cacheBust(keys.nextSteps())
      cacheBust(keys.clients())
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const total = rows ? rows.length : 0

  return (
    <Layout title="Client tiers" subtitle={rows ? `${total} client${total === 1 ? '' : 's'}. Click a name for their plan and live status.` : 'Loading…'}>
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {!rows ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3" data-tier-columns>
            {TIERS.map((t) => (
              <section key={t.tier} className="rounded-xl border border-slate-200 bg-white" data-tier={t.tier}>
                <header className="flex items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold text-slate-900">{t.short}</h2>
                    <p className="truncate text-xs text-slate-500">{t.short.includes('$') ? t.name : `${tierPrice(t.tier)} · ${t.name}`}</p>
                  </div>
                  <span className="flex-shrink-0 text-2xl font-bold tabular-nums text-slate-900">{columns[t.tier].length}</span>
                </header>
                <div className="p-1.5">
                  {columns[t.tier].length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-slate-400">Nobody on this plan.</p>
                  ) : (
                    columns[t.tier].map((r) => <NameButton key={r.client.id} row={r} onOpen={setOpenId} />)
                  )}
                </div>
              </section>
            ))}
          </div>

          {columns[0].length > 0 && (
            <section className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2" data-tier="0">
              <span className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">No plan set</span>
              {columns[0].map((r) => (
                <div key={r.client.id} className="w-auto">
                  <NameButton row={r} onOpen={setOpenId} />
                </div>
              ))}
            </section>
          )}
        </>
      )}

      <Modal isOpen={Boolean(open)} onClose={() => setOpenId(null)} title={open?.client.name || ''}>
        {open && <Details row={open} onTier={changeTier} saving={saving} />}
      </Modal>
    </Layout>
  )
}
