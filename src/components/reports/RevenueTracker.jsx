import { useMemo, useState } from 'react'
import { cn } from '../ui/cn'
import { money, monthToLog, parseCount, parseMoney, revenueEntryProblem, revenueMonths, revenueTotals } from '../../lib/clientDashboard'
import { supabase } from '../../lib/supabaseClient'
import { DTd, DTh, DTr, Panel, Pill, SectionTitle } from './kit'

/**
 * The revenue tracker on a client's dashboard.
 *
 * Cost per lead says the ads are working. It cannot say the leads were worth
 * having: only the owner knows which ones booked and what they paid. So this
 * asks them, once a month, for two numbers (how many of the leads became
 * jobs, and what those jobs were worth) and shows them back against the ad
 * spend for the same month.
 *
 * The question used to live behind the weekly email, and in three months
 * nobody answered it once. It is on the page now, with the newest finished
 * month that has no figure asked about at the top.
 *
 * This is the one thing on the dashboard that writes. It goes through
 * client_revenue_save with the token from the link; there is no table access.
 */

const fmtLeads = (n) => (Number.isInteger(Number(n)) ? String(n) : Number(n).toFixed(1))
const plural = (n, one, many) => (Number(n) === 1 ? one : many)
const INPUT =
  'min-h-[44px] w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/30'

/** The two boxes and the button. Used for the month being asked about and for editing any other. */
function EntryForm({ row, onSave, onCancel, autoFocus = false }) {
  const [jobs, setJobs] = useState(row.logged ? String(row.jobs) : '')
  const [revenue, setRevenue] = useState(row.logged ? String(row.revenue) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    const problem = revenueEntryProblem(jobs, revenue)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError('')
    const failed = await onSave(row.month, parseCount(jobs), parseMoney(revenue))
    setSaving(false)
    if (failed) setError(failed)
  }

  return (
    <form onSubmit={submit} className="space-y-2" data-revenue-form={row.month}>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Jobs from these leads</span>
          <input className={INPUT} inputMode="numeric" value={jobs} onChange={(e) => setJobs(e.target.value)} placeholder="0" autoFocus={autoFocus} aria-label={`Jobs booked in ${row.label}`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">What they were worth</span>
          <input className={INPUT} inputMode="decimal" value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="$0" aria-label={`Revenue in ${row.label}`} />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] flex-1 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200 disabled:opacity-60 sm:flex-none"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="min-h-[44px] rounded-xl px-3 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-slate-200">
              Cancel
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-xs font-medium text-rose-300">{error}</p>}
    </form>
  )
}

/** Revenue against ad spend for one month, drawn to the same scale as every other month. */
function Bars({ row, max }) {
  const pct = (v) => `${Math.max(v > 0 ? 2 : 0, Math.round((v / max) * 100))}%`
  return (
    <div className="space-y-1" aria-hidden="true">
      <div className="h-1.5 rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-emerald-400" style={{ width: row.logged ? pct(row.revenue) : '0%' }} />
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-slate-500" style={{ width: pct(row.spend) }} />
      </div>
    </div>
  )
}

export default function RevenueTracker({ months, token, onSaved, example = '' }) {
  const rows = useMemo(() => revenueMonths(months), [months])
  const totals = useMemo(() => revenueTotals(rows), [rows])
  const ask = monthToLog(rows)
  const [editing, setEditing] = useState(null)
  const [savedMonth, setSavedMonth] = useState(null)
  const [showAll, setShowAll] = useState(false)

  const max = Math.max(1, ...rows.map((r) => Math.max(r.spend, r.revenue || 0)))
  const shown = showAll ? rows : rows.slice(0, 6)

  const save = async (month, jobs, revenue) => {
    const { data, error } = await supabase.rpc('client_revenue_save', { p_token: token, p_month: month, p_jobs: jobs, p_revenue: revenue })
    if (error) return error.message
    if (!data) return 'This link is no longer active. Ask us for a new one.'
    onSaved({ month, jobs, revenue })
    setEditing(null)
    setSavedMonth(month)
    return ''
  }

  const returnLine = (row) => (row.back !== null ? `${money(row.back)} back per $1` : '')

  return (
    <Panel className="p-5" data-revenue-tracker>
      <SectionTitle title="Revenue from your leads" sub="What the jobs from these ads were worth, month by month" />

      {/* THE ASK: the newest finished month with no figure. */}
      {ask && (
        <div className="mb-5 rounded-xl border border-sky-400/30 bg-sky-400/10 p-4" data-revenue-ask={ask.month}>
          <p className="text-sm font-semibold text-white">How did {ask.label} turn out?</p>
          <p className="mt-1 text-sm text-slate-300">
            {ask.leads > 0
              ? `${fmtLeads(ask.leads)} ${plural(ask.leads, 'lead', 'leads')} came in from ${money(ask.spend)} in ads. How many became jobs, and what were those jobs worth?`
              : `You spent ${money(ask.spend)} on ads. How many jobs came from them, and what were those jobs worth?`}
          </p>
          <div className="mt-3">
            <EntryForm key={ask.month} row={ask} onSave={save} />
          </div>
          <p className="mt-2 text-xs text-slate-400">Takes 20 seconds. Rough numbers are fine, and you can change them later.</p>
        </div>
      )}

      {savedMonth && (
        <p className="mb-4 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200" role="status">
          Saved {rows.find((r) => r.month === savedMonth)?.label || 'that month'}. Thank you.
        </p>
      )}

      {/* THE TOTALS, once anything is logged. */}
      {totals.months > 0 ? (
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-slate-400">Revenue from leads</p>
            <p className="mt-0.5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{money(totals.revenue)}</p>
            <p className="mt-1 text-xs text-slate-400">
              {totals.jobs} {plural(totals.jobs, 'job', 'jobs')} over {totals.months} {plural(totals.months, 'month', 'months')} logged
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Ad spend, same {plural(totals.months, 'month', 'months')}</p>
            <p className="mt-0.5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{money(totals.spend)}</p>
            <p className="mt-1 text-xs text-slate-400">
              {fmtLeads(totals.leads)} {plural(totals.leads, 'lead', 'leads')}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Back for every $1 in ads</p>
            <p className="mt-0.5 text-3xl font-semibold tracking-tight text-emerald-300 sm:text-4xl">{totals.back !== null ? money(totals.back) : 'n/a'}</p>
            {totals.best && <p className="mt-1 text-xs text-slate-400">Best month: {totals.best.label}, {money(totals.best.revenue)}</p>}
          </div>
        </div>
      ) : (
        <div className="mb-5 space-y-2 text-sm leading-relaxed text-slate-300">
          <p>Cheap leads are not the goal. Booked jobs are.</p>
          <p>
            Cost per lead tells us the ads are working. It cannot tell us the leads were worth having. Only you know that, because you know which ones booked and what they paid. Log it
            here each month and this page shows what every ad dollar brought back.
          </p>
          {example && <p className="rounded-lg border-l-2 border-sky-400 bg-sky-400/10 px-3 py-2 text-slate-200">{example}</p>}
        </div>
      )}

      {/* MONTH BY MONTH. Cards on a phone, a table on anything wider. */}
      <ul className="space-y-2 md:hidden" data-revenue-list>
        {shown.map((row) => (
          <li key={row.month} className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-white">
                {row.label}
                {row.current && <span className="ml-1.5 text-xs font-normal text-slate-400">so far</span>}
              </span>
              {row.logged ? (
                <span className="whitespace-nowrap text-sm font-semibold text-emerald-300">{money(row.revenue)}</span>
              ) : (
                <span className="text-xs text-slate-400">not logged</span>
              )}
            </div>
            <div className="mt-2">
              <Bars row={row} max={max} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="block text-slate-500">Ad spend</span>
                <span className="text-slate-200">{money(row.spend)}</span>
              </div>
              <div>
                <span className="block text-slate-500">Leads</span>
                <span className="text-slate-200">{fmtLeads(row.leads)}</span>
              </div>
              <div>
                <span className="block text-slate-500">Jobs</span>
                <span className={row.logged ? 'text-slate-200' : 'text-slate-500'}>{row.logged ? row.jobs : '…'}</span>
              </div>
            </div>
            {row.logged && row.back !== null && <p className="mt-2 text-xs text-slate-300">{returnLine(row)}</p>}
            {editing === row.month ? (
              <div className="mt-3">
                <EntryForm row={row} onSave={save} onCancel={() => setEditing(null)} autoFocus />
              </div>
            ) : (
              ask?.month !== row.month && (
                <button type="button" onClick={() => setEditing(row.month)} className="mt-2 min-h-[44px] text-sm font-medium text-sky-300 hover:text-sky-200">
                  {row.logged ? 'Change' : row.current ? 'Log it so far' : 'Log this month'}
                </button>
              )
            )}
          </li>
        ))}
      </ul>

      <table className="hidden w-full text-sm md:table" data-revenue-table>
        <thead>
          <tr>
            <DTh>Month</DTh>
            <DTh numeric>Ad spend</DTh>
            <DTh numeric>Leads</DTh>
            <DTh numeric>Jobs</DTh>
            <DTh numeric>Revenue</DTh>
            <DTh numeric>Back per $1</DTh>
            <DTh className="w-[18%]">Revenue vs ad spend</DTh>
            <DTh />
          </tr>
        </thead>
        <tbody>
          {shown.map((row) =>
            editing === row.month ? (
              <DTr key={row.month}>
                <DTd className="whitespace-nowrap align-top font-medium text-white">{row.label}</DTd>
                <DTd colSpan={7}>
                  <EntryForm row={row} onSave={save} onCancel={() => setEditing(null)} autoFocus />
                </DTd>
              </DTr>
            ) : (
              <DTr key={row.month}>
                <DTd className="whitespace-nowrap font-medium text-white">
                  {row.label}
                  {row.current && <span className="ml-1.5 text-xs font-normal text-slate-400">so far</span>}
                </DTd>
                <DTd numeric>{money(row.spend)}</DTd>
                <DTd numeric>{fmtLeads(row.leads)}</DTd>
                <DTd numeric muted={!row.logged}>
                  {row.logged ? row.jobs : ''}
                  {row.closeRate !== null && row.jobs > 0 && <span className="ml-1 text-xs text-slate-500">({row.closeRate}%)</span>}
                </DTd>
                <DTd numeric muted={!row.logged} className={cn(row.logged && 'font-semibold text-emerald-300')}>
                  {row.logged ? money(row.revenue) : <Pill>not logged</Pill>}
                </DTd>
                <DTd numeric className="font-semibold text-white">
                  {row.back !== null ? money(row.back) : ''}
                </DTd>
                <DTd>
                  <Bars row={row} max={max} />
                </DTd>
                <DTd numeric>
                  {ask?.month !== row.month && (
                    <button type="button" onClick={() => setEditing(row.month)} className="whitespace-nowrap text-sm font-medium text-sky-300 hover:text-sky-200">
                      {row.logged ? 'Change' : row.current ? 'Log so far' : 'Log'}
                    </button>
                  )}
                </DTd>
              </DTr>
            )
          )}
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-4 rounded-full bg-emerald-400" /> Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-4 rounded-full bg-slate-500" /> Ad spend
          </span>
        </span>
        {rows.length > 6 && (
          <button type="button" onClick={() => setShowAll(!showAll)} className="font-medium text-sky-300 hover:text-sky-200">
            {showAll ? 'Show the last 6 months' : `Show all ${rows.length} months`}
          </button>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Count only jobs that came from these leads. Totals use the months you have logged, against the ad spend for those same months.
      </p>
    </Panel>
  )
}
