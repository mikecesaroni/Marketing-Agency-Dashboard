import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import TeamBriefPanel from '../components/TeamBriefPanel'
import { cached, keys } from '../lib/pageCache'
import { fetchWeeklyStatus } from '../lib/weeklyStatusData'
import { money, weeklyText } from '../lib/weeklyStatus'
import { copyText } from '../lib/intakeSummary'
import { Badge, Button, Card, StatCard } from '../components/ui'

/**
 * THE WEEKLY EXECUTIVE STATUS. Every client on one page, last week against
 * the week before: how the ads stand, spend, leads and cost per lead with
 * the change, the trend over four weeks, whether a new ad is needed, and
 * three key points at most. Worst first, so the Monday meeting opens on
 * what needs a decision and closes on the wins. "Copy report" puts the
 * same thing in plain text for Slack or the meeting notes.
 *
 * The numbers are the same ad days the client reports use, for the same
 * Monday-to-Sunday week, so the team's figures and the clients' agree. The
 * logic is src/lib/weeklyStatus.js (pinned by scripts/check-weekly-status.mjs).
 * The team brief and the Slack channel live under it (TeamBriefPanel).
 */

const TONE = {
  red: 'danger',
  amber: 'warning',
  green: 'success',
  purple: 'info',
  slate: 'dim',
}

const TREND = {
  up: { glyph: '▲', cls: 'text-emerald-700', label: 'Up' },
  down: { glyph: '▼', cls: 'text-red-700', label: 'Down' },
  flat: { glyph: '→', cls: 'text-slate-500', label: 'Steady' },
  none: { glyph: '·', cls: 'text-slate-400', label: 'No ads' },
}

const pctText = (v, { lowerIsBetter = false } = {}) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return { text: '', cls: 'text-slate-400' }
  if (Math.abs(v) < 0.5) return { text: 'same', cls: 'text-slate-400' }
  const up = v > 0
  const good = lowerIsBetter ? !up : up
  return { text: `${up ? '▲' : '▼'} ${Math.round(Math.abs(v))}%`, cls: good ? 'text-emerald-700' : 'text-red-700' }
}

function Change({ value, lowerIsBetter }) {
  const p = pctText(value, { lowerIsBetter })
  if (!p.text) return null
  return <span className={`ml-1 text-[11px] tabular-nums ${p.cls}`}>{p.text}</span>
}

/** Four little bars: leads per week, oldest first. */
function Bars({ weeks }) {
  const max = Math.max(1, ...weeks.map((w) => w.leads))
  return (
    <span className="inline-flex h-5 items-end gap-0.5" aria-hidden="true" title={weeks.map((w) => `${w.week}: ${w.leads} leads, ${money(w.spend)}`).join('\n')}>
      {weeks.map((w, i) => (
        <span key={w.week} className={`w-1.5 rounded-sm ${i === weeks.length - 1 ? 'bg-slate-800' : 'bg-slate-300'}`} style={{ height: `${Math.max(2, Math.round((w.leads / max) * 20))}px` }} />
      ))}
    </span>
  )
}

function Trend({ trend, weeks }) {
  const t = TREND[trend.key] || TREND.none
  return (
    <span className="inline-flex items-center gap-2" title={trend.why || t.label}>
      <Bars weeks={weeks} />
      <span className={`text-xs font-semibold ${t.cls}`}>
        {t.glyph} {t.label}
      </span>
    </span>
  )
}

function Row({ r }) {
  return (
    <tr className="border-t border-slate-100 align-top" data-weekly-row={r.client.id} data-rank={r.rank}>
      <td className="py-2.5 pr-3">
        <Link to={`/client/${r.client.id}`} className="font-medium text-slate-900 hover:underline">
          {r.client.name}
        </Link>
        <p className="text-[11px] text-slate-400">{r.tierName}</p>
      </td>
      <td className="py-2.5 pr-3">
        <Badge tone={TONE[r.ads.tone] || 'neutral'}>{r.ads.label}</Badge>
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        {money(r.now.spend)}
        <Change value={r.change.spend} />
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        {r.now.leads}
        <Change value={r.change.leads} />
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        {r.now.leads > 0 ? money(r.now.cpl) : <span className="text-slate-400">·</span>}
        {r.now.leads > 0 && <Change value={r.change.cpl} lowerIsBetter />}
      </td>
      <td className="py-2.5 pr-3">
        <Trend trend={r.trend} weeks={r.weeks} />
      </td>
      <td className="py-2.5 pr-3">{r.creative.label ? <Badge tone={TONE[r.creative.tone] || 'neutral'}>{r.creative.label}</Badge> : <span className="text-slate-300">·</span>}</td>
      <td className="py-2.5 text-xs text-slate-700">
        {r.points.map((p, i) => (
          <p key={i} className={i === 0 ? 'font-medium text-slate-900' : ''}>
            {p}
          </p>
        ))}
      </td>
    </tr>
  )
}

function MobileCard({ r }) {
  return (
    <Card className="space-y-1.5" data-weekly-card={r.client.id}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link to={`/client/${r.client.id}`} className="font-semibold text-slate-900">
            {r.client.name}
          </Link>
          <p className="text-[11px] text-slate-400">{r.tierName}</p>
        </div>
        <Badge tone={TONE[r.ads.tone] || 'neutral'}>{r.ads.label}</Badge>
      </div>
      <p className="text-sm tabular-nums text-slate-800">
        {money(r.now.spend)}
        <Change value={r.change.spend} /> · {r.now.leads} leads
        <Change value={r.change.leads} />
        {r.now.leads > 0 && (
          <>
            {' '}
            at {money(r.now.cpl)}
            <Change value={r.change.cpl} lowerIsBetter />
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Trend trend={r.trend} weeks={r.weeks} />
        {r.creative.label && <Badge tone={TONE[r.creative.tone] || 'neutral'}>{r.creative.label}</Badge>}
      </div>
      <ul className="text-xs text-slate-700">
        {r.points.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </Card>
  )
}

export default function WeeklyStatusPage() {
  const [weeksBack, setWeeksBack] = useState(0)
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setError('')
    cached(keys.weeklyStatus(weeksBack), () => fetchWeeklyStatus({ weeksBack }), (r) => setReport(r)).catch((err) => setError(err.message))
  }, [weeksBack])

  const copy = async () => {
    if (!report) return
    await copyText(weeklyText(report, { appUrl: window.location.origin }))
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const t = report?.totals
  const spend = t ? pctText(t.change.spend) : null
  const leads = t ? pctText(t.change.leads) : null
  const cpl = t ? pctText(t.change.cpl, { lowerIsBetter: true }) : null

  return (
    <Layout
      title="Weekly status"
      subtitle={report ? `${report.label}, against ${report.prevLabel}. Meta and Google ad days plus LSA logged by hand; data through yesterday.` : 'Loading…'}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeeksBack((w) => w + 1)} title="The week before" data-week-back>
            ‹
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeeksBack((w) => Math.max(0, w - 1))} disabled={weeksBack === 0} title="The week after" data-week-forward>
            ›
          </Button>
          <Button variant="primary" size="sm" onClick={copy} disabled={!report} data-copy-report>
            {copied ? 'Copied' : 'Copy report'}
          </Button>
        </div>
      }
    >
      {error && (
        <Card tone="danger" className="text-red-700">
          {error}
        </Card>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-weekly-totals>
            <StatCard label="Spent" value={money(t.spend)} sub={<span className={spend.cls}>{spend.text ? `${spend.text} vs the week before` : 'no earlier week'}</span>} />
            <StatCard label="Leads" value={String(t.leads)} sub={<span className={leads.cls}>{leads.text ? `${leads.text} vs the week before` : 'no earlier week'}</span>} />
            <StatCard label="Cost per lead" value={t.leads > 0 ? money(t.cpl) : '·'} sub={<span className={cpl.cls}>{cpl.text ? `${cpl.text} vs the week before` : t.leads > 0 ? 'no earlier week' : 'no leads'}</span>} alert={t.leads === 0 && t.spend > 0} />
            <StatCard label="Running" value={`${t.running} of ${t.clients}`} sub={`${t.adsOff} with ads off · ${t.needAds} need a new ad`} alert={t.adsOff > 0} />
          </div>

          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" data-weekly-counts>
            <span className="text-emerald-700">▲ {t.up} trending up</span>
            <span className="text-red-700">▼ {t.down} down</span>
            <span>{t.needAds} need a new ad</span>
            <span>{t.adsOff} with ads off</span>
            <span>
              {t.needCall} need a call ·{' '}
              <Link to="/status" className="text-blue-700 hover:underline">
                Client status
              </Link>
            </span>
          </p>

          <Card className="mt-4 hidden overflow-x-auto md:block" padding="sm">
            <table className="w-full text-sm" data-weekly-table>
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3">Client</th>
                  <th className="pb-2 pr-3">Ads</th>
                  <th className="pb-2 pr-3 text-right">Spent</th>
                  <th className="pb-2 pr-3 text-right">Leads</th>
                  <th className="pb-2 pr-3 text-right">Per lead</th>
                  <th className="pb-2 pr-3">Trend, 4 weeks</th>
                  <th className="pb-2 pr-3">New ad?</th>
                  <th className="pb-2">Key points</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <Row key={r.client.id} r={r} />
                ))}
              </tbody>
            </table>
            {report.rows.length === 0 && <p className="p-3 text-sm text-slate-500">No active clients.</p>}
          </Card>

          <div className="mt-4 space-y-3 md:hidden">
            {report.rows.map((r) => (
              <MobileCard key={r.client.id} r={r} />
            ))}
          </div>
        </>
      )}

      <TeamBriefPanel />
    </Layout>
  )
}
