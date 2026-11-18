import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/pagedQuery'
import { money, today } from '../lib/queries'
import { BILLING_COLUMNS, billingTotals, billingWorkbook, buildBillingSheet } from '../lib/billingSheet'
import { makeXlsx } from '../lib/xlsxWriter'
import { Button, Card } from './ui'

/**
 * The client billing sheet, live, with a Download Excel button.
 *
 * "Can we get an excel sheet built with client name, business name, date
 * first paid, date paused, active status, monthly subscription, set up fee
 * amount paid, match everything with Stripe because that is real data. Keep
 * this updated as clients are added, payments come in, and clients are
 * paused" (2026-11-18), "also add in what tier they are on".
 *
 * Nothing is stored: the rows are built from the clients and from the
 * payments Stripe made (the webhook writes them within seconds), every time
 * this page opens and again when Download is pressed, so the file is always
 * current. The rules are src/lib/billingSheet.js.
 */
export default function BillingSheetPanel() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const [clients, payments, intakes, ghl, events] = await Promise.all([
      supabase.from('clients').select('id,name,archived,is_internal,paused_at,tier,monthly_fee,setup_fee,stripe_customer_id,date_added'),
      fetchAllRows(() =>
        supabase
          .from('payments')
          .select('id,client_id,payment_type,status,amount,paid_date,due_date,stripe_event_id,stripe_invoice_id,stripe_charge_id,stripe_customer_id,failure_count,duplicate_reviewed_at')
          .order('created_at')
          .order('id')
      ),
      supabase.from('onboarding_intake').select('client_id,owner_name'),
      supabase.from('ghl_setup').select('client_id,authorized_rep_name'),
      // Only the cancellations: when Stripe ended a subscription.
      supabase.from('stripe_events').select('id,type,payload').eq('type', 'customer.subscription.deleted'),
    ])
    if (clients.error) throw clients.error
    return {
      clients: clients.data || [],
      payments,
      intakes: intakes.data || [],
      ghl: ghl.data || [],
      events: events.data || [],
    }
  }

  useEffect(() => {
    load()
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])

  const rows = useMemo(() => (data ? buildBillingSheet({ ...data, today: today() }) : []), [data])
  const totals = useMemo(() => billingTotals(rows), [rows])

  // Read again at the moment of the download, so the file has the payment
  // that came in while the page sat open.
  const download = async () => {
    setBusy(true)
    setError('')
    try {
      const fresh = await load()
      setData(fresh)
      const day = today()
      const blob = await makeXlsx(billingWorkbook(buildBillingSheet({ ...fresh, today: day }), { today: day }))
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `client-billing-${day}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const cell = (r, c) => {
    const v = r[c.key]
    if (v === null || v === undefined || v === '') return ''
    if (c.kind === 'money') return money(v)
    if (c.kind === 'date') return new Date(`${v}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return v
  }

  return (
    <Card className="mb-6" data-billing-sheet>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">Client billing sheet</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Every client with their tier, status, first payment, pause date, monthly subscription and setup fee paid. The money is what Stripe
            charged, not what the CRM expects. Always current: it is rebuilt each time you open this page or download it.
          </p>
          {data && (
            <p className="mt-1.5 text-xs text-slate-700">
              {totals.active} active · {totals.paused} paused · {totals.archived} archived · <span className="font-semibold">{money(totals.stripeMonthly)}/mo</span> charging in
              Stripe · {money(totals.setupCollected)} setup collected
              {totals.flagged > 0 && <span className="text-amber-700"> · {totals.flagged} to check (see Notes)</span>}
            </p>
          )}
          {error && <p className="mt-1.5 text-xs text-red-700">{error}</p>}
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)} disabled={!data}>
            {open ? 'Hide the sheet' : 'Show the sheet'}
          </Button>
          <Button size="sm" onClick={download} disabled={busy || !data} data-download-billing>
            {busy ? 'Building…' : '⬇ Download Excel'}
          </Button>
        </div>
      </div>

      {open && data && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {BILLING_COLUMNS.map((c) => (
                  <th key={c.key} className={`whitespace-nowrap px-2.5 py-2 font-semibold ${c.kind === 'money' ? 'text-right' : ''}`}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className={r.status === 'Active' ? '' : 'text-slate-500'}>
                  {BILLING_COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      className={`px-2.5 py-1.5 ${c.kind === 'money' ? 'whitespace-nowrap text-right tabular-nums' : c.key === 'notes' ? 'min-w-[16rem] text-amber-800' : 'whitespace-nowrap'} ${c.key === 'business' ? 'font-medium text-slate-900' : ''}`}
                    >
                      {cell(r, c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
