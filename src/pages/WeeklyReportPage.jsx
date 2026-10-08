import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { GLOSSARY, WHY_RETURN, answerWeeklyReport, loadWeeklyReport, money } from '../lib/weeklyReport'

// The web copy of a weekly report, for the client. Same numbers and words as
// the email, laid out for a phone, plus the one question the email cannot
// collect: how did the leads do? The token in the link is the credential;
// there is no login and no agency chrome.

const fmtLeads = (n) => (Number.isInteger(Number(n)) ? String(n) : Number(n).toFixed(1))
const fmtInt = (n) => Number(n || 0).toLocaleString('en-US')

function Delta({ value, lowerIsBetter = false, neutral = false }) {
  if (value == null || !Number.isFinite(value)) return null
  const flat = Math.abs(value) < 1
  const up = value > 0
  const good = flat || neutral ? null : lowerIsBetter ? !up : up
  const cls = good === null ? 'text-slate-500' : good ? 'text-emerald-700' : 'text-red-700'
  return <div className={`mt-1 text-[11px] ${cls}`}>{flat ? 'same as last week' : `${up ? '▲' : '▼'} ${Math.abs(value)}% vs last week`}</div>
}

function Tile({ label, value, delta, lowerIsBetter, neutral }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-xl font-bold text-slate-900">{value}</div>
      <Delta value={delta} lowerIsBetter={lowerIsBetter} neutral={neutral} />
    </div>
  )
}

export default function WeeklyReportPage() {
  const { token } = useParams()
  const [row, setRow] = useState(undefined)
  const [jobs, setJobs] = useState('')
  const [revenue, setRevenue] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadWeeklyReport(token)
      .then((r) => {
        setRow(r)
        if (r?.answered_at) {
          setJobs(r.jobs_booked ?? '')
          setRevenue(r.revenue ?? '')
          setNote(r.client_note || '')
          setSaved(true)
        }
      })
      .catch((err) => {
        setError(err.message)
        setRow(null)
      })
  }, [token])

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await answerWeeklyReport(token, { jobs, revenue, note })
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (row === undefined) return <div className="min-h-screen bg-slate-100 p-6 text-sm text-slate-500">Loading your report…</div>
  if (row === null)
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">This report link is not valid or has expired. Reply to the email it came in and we will send a fresh one.</div>
      </div>
    )

  const m = row.model || {}
  const totals = m.totals || {}
  const d = m.deltas || {}
  const summary = m.summary || []
  const rn = m.returnNote || []
  const top = m.topAd

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-xl space-y-5">
        <header className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-orange-600">Your week in ads</div>
          <h1 className="mt-1 text-2xl font-bold">{row.client_name}</h1>
          <p className="text-sm text-slate-500">{m.week?.label}</p>
          <p className="mt-3 text-[15px] leading-relaxed">{summary.join(' ')}</p>
        </header>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Tile label="Spend" value={money(totals.spend)} delta={d.spend} neutral />
          <Tile label="Leads" value={fmtLeads(totals.leads || 0)} delta={d.leads} />
          <Tile label="Cost per lead" value={totals.cpl > 0 ? money(totals.cpl) : '—'} delta={totals.cpl > 0 ? d.cpl : null} lowerIsBetter />
          <Tile label="Impressions" value={fmtInt(totals.impressions)} delta={d.impressions} />
          <Tile label="Click rate" value={`${totals.ctr ?? 0}%`} delta={d.ctr} />
        </section>

        {top && (
          <p className="rounded-xl bg-white px-4 py-3 text-sm shadow-sm">
            <strong>Best ad last week:</strong> {top.name} brought {fmtLeads(top.leads)} {Number(top.leads) === 1 ? 'lead' : 'leads'} for {money(top.spend)}.
          </p>
        )}

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold">The number that matters most</h2>
          <div className="mt-2 space-y-2 text-sm leading-relaxed">
            {WHY_RETURN.map((p) => (
              <p key={p}>{p}</p>
            ))}
            {rn.map((p) => (
              <p key={p} className="rounded-lg border-l-4 border-orange-500 bg-orange-50 px-3 py-2">
                {p}
              </p>
            ))}
          </div>

          <form onSubmit={submit} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4" data-answer-form>
            <p className="text-sm font-semibold">How did last week&apos;s leads do?</p>
            <p className="text-xs text-slate-500">Rough numbers are fine. This takes 20 seconds and makes your next report about money, not just leads.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-600">
                Leads that became jobs
                <input type="number" min="0" inputMode="numeric" value={jobs} onChange={(e) => setJobs(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base" placeholder="e.g. 3" />
              </label>
              <label className="text-xs text-slate-600">
                Roughly what they were worth ($)
                <input type="number" min="0" inputMode="decimal" value={revenue} onChange={(e) => setRevenue(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base" placeholder="e.g. 8400" />
              </label>
            </div>
            <label className="mt-3 block text-xs text-slate-600">
              Anything we should know? (optional)
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. two of the leads were outside our area" />
            </label>
            <div className="mt-3 flex items-center gap-3">
              <button type="submit" disabled={saving} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">
                {saving ? 'Saving…' : saved ? 'Update' : 'Send to our team'}
              </button>
              {saved && <span className="text-sm text-emerald-700">Thank you. Your next report will show your return on the ads.</span>}
            </div>
            {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
          </form>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold">What each number means</h2>
          <dl className="mt-2 divide-y divide-slate-200 text-sm">
            {GLOSSARY.map((g) => (
              <div key={g.key} className="py-2">
                <dt className="font-semibold">{g.label}</dt>
                <dd className="text-slate-700">{g.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <footer className="px-1 text-xs text-slate-500">
          These numbers come straight from your ad accounts for {m.week?.label}. Questions? Reply to the email this came in and a real person answers.
        </footer>
      </div>
    </div>
  )
}
