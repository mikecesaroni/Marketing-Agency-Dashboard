import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { reportMonth } from '../lib/monthlyReport'
import { money } from '../lib/queries'

const STATUS_STYLE = {
  sent: 'bg-green-100 text-green-800',
  skipped: 'bg-slate-100 text-slate-600',
  failed: 'bg-red-100 text-red-800',
}

// Reports go out unattended, so this is where you find out what actually
// happened: who received one, who was skipped and why, and anything the
// provider rejected.
export default function MonthlyReportsPanel() {
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const month = reportMonth()

  const load = () =>
    supabase
      .from('report_sends')
      .select('*, clients(name)')
      .eq('month_key', month.key)
      .order('status')
      .then(({ data, error: err }) => {
        if (err) setRows([])
        else setRows(data || [])
      })

  useEffect(() => {
    load()
  }, [])

  // A dry run answers the only question that matters before the 1st: who would
  // this actually email, and with what numbers.
  const runDry = async () => {
    setBusy(true)
    setError('')
    setPreview(null)
    try {
      const { data, error: err } = await supabase.functions.invoke('monthly-report', {
        body: { month: month.key.slice(0, 7), dry_run: true },
      })
      if (err) throw new Error(data?.error || err.message)
      if (data?.error) throw new Error(data.error)
      setPreview(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (rows === null) return null

  const sent = rows.filter((r) => r.status === 'sent').length
  const failed = rows.filter((r) => r.status === 'failed').length

  return (
    <div className="bg-white border border-slate-200 rounded-xl mb-4 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
      >
        <span className="font-semibold text-slate-900">
          📧 Monthly client reports
          <span className="ml-1.5 text-sm font-normal text-slate-500">{month.label}</span>
          {rows.length === 0 ? (
            <span className="ml-2 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
              not run yet
            </span>
          ) : (
            <span className="ml-2 px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-semibold">
              {sent} sent
            </span>
          )}
          {failed > 0 && (
            <span className="ml-1.5 px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-semibold">
              {failed} failed
            </span>
          )}
        </span>
        <span className="text-slate-400 text-sm">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-200 p-4 space-y-3">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={runDry}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-50 transition"
            >
              {busy ? 'Checking...' : 'Preview without sending'}
            </button>
            <p className="text-[11px] text-slate-500">
              Sends automatically on the 1st, to clients with live Meta campaigns only.
            </p>
          </div>

          {preview && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <p className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700">
                Dry run for {preview.month} — {preview.sent} would send, {preview.skipped} skipped
              </p>
              {preview.results.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 px-3 py-2 border-t border-slate-100 text-xs"
                >
                  <span className="font-medium text-slate-800 truncate">{r.client}</span>
                  <span className="text-slate-500 truncate text-right">
                    {r.status === 'sent'
                      ? `→ ${r.recipient} · ${r.leads} leads · ${money(r.spend)}`
                      : r.reason}
                  </span>
                </div>
              ))}
            </div>
          )}

          {rows.length > 0 && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <p className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700">
                What went out for {month.label}
              </p>
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 border-t border-slate-100 text-xs"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className={`px-1.5 py-0.5 rounded font-semibold ${STATUS_STYLE[r.status] || ''}`}
                    >
                      {r.status}
                    </span>
                    <span className="font-medium text-slate-800 truncate">
                      {r.clients?.name || 'Unknown client'}
                    </span>
                  </span>
                  <span className="text-slate-500 truncate text-right">
                    {r.status === 'sent' ? r.recipient : r.reason}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
