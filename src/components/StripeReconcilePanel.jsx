import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { money } from '../lib/queries'
import { duplicateSuspects, feeMismatches } from '../lib/reconcile'
import { GHL_BILLING } from '../lib/ghlSetupFields'
import { Badge, Button, Card } from './ui'

/**
 * Where the CRM disagrees with Stripe.
 *
 * Stripe is the record of what people actually pay; the fees on a client row
 * are only what somebody typed, and they drift. Two clients moved onto the
 * combined $1,500 plan and nobody updated the CRM, so MRR under-reported them
 * by $103 each for a month before anyone noticed. This is what makes that kind
 * of drift visible on the page where the money lives, rather than leaving it
 * to be spotted by eye.
 *
 * Nothing here changes anything on its own. Every fix is a button, because
 * "Stripe charged a different amount" has more than one possible cause -- a
 * plan change, a proration, a one-off discount -- and only a person knows
 * which.
 */
export default function StripeReconcilePanel({ clients, payments, onFixed }) {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState(() => new Set())

  const mismatches = useMemo(() => feeMismatches(clients, payments), [clients, payments])
  const duplicates = useMemo(() => duplicateSuspects(payments, clients), [payments, clients])

  // A duplicate inflates what Stripe looks to have collected, which then shows
  // up here as a fee mismatch that is not real. Saying "under-reporting by
  // $399" when that $399 is a row recorded twice would send you to change a
  // fee that was right all along, so a client with a duplicate is told to
  // clear that first.
  const withDuplicate = useMemo(
    () => new Set(duplicates.map((d) => d.clientId)),
    [duplicates]
  )

  const applySuggestion = async (row) => {
    const s = row.suggestion
    if (!s) return
    const shape =
      s.ghl_billing === GHL_BILLING.separate.key
        ? `${money(s.monthly_fee)} retainer plus ${money(s.ghl_monthly_fee)} GHL, billed separately`
        : `${money(s.monthly_fee)} a month${s.ghl_monthly_fee ? `, ${money(s.ghl_monthly_fee)} of it GHL` : ''}`
    if (!confirm(`Set ${row.client.name} to ${shape}?\n\nThis matches what Stripe collected in ${row.month}. It changes the fees on the client, not any payment already recorded.`))
      return

    setBusy(row.client.id)
    setError('')
    try {
      const { error: err } = await supabase
        .from('clients')
        .update({
          monthly_fee: s.monthly_fee,
          ghl_billing: s.ghl_billing,
          ghl_monthly_fee: s.ghl_monthly_fee,
        })
        .eq('id', row.client.id)
      if (err) throw err
      setDone((d) => new Set(d).add(row.client.id))
      await onFixed?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const removeExtra = async (group) => {
    const extra = group.extras[0]
    if (!extra) return
    if (
      !confirm(
        `Delete the duplicate ${money(group.amount)} payment for ${group.clientName} on ${group.paidDate}?\n\n` +
          `Stripe recorded this payment once. The CRM has ${group.rows.length} rows for it, and the one being kept is the row carrying the Stripe invoice ID.\n\n` +
          `This permanently deletes a payment record.`
      )
    )
      return

    setBusy(extra.id)
    setError('')
    try {
      const { error: err } = await supabase.from('payments').delete().eq('id', extra.id)
      if (err) throw err
      await onFixed?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const nothingWrong = mismatches.length === 0 && duplicates.length === 0
  if (nothingWrong) {
    return (
      <Card tone="success" className="mb-4">
        <p className="text-sm font-semibold text-slate-900">✓ The books agree with Stripe</p>
        <p className="mt-0.5 text-xs text-slate-600">
          Every billing client&rsquo;s fees match what Stripe actually collected from them last
          month, and no payment is recorded twice.
        </p>
      </Card>
    )
  }

  return (
    <Card tone="warning" className="mb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">
          Doesn&rsquo;t match Stripe
          <span className="ml-1.5 font-normal text-slate-600">
            {mismatches.length > 0 && `${mismatches.length} fee${mismatches.length === 1 ? '' : 's'}`}
            {mismatches.length > 0 && duplicates.length > 0 && ' · '}
            {duplicates.length > 0 &&
              `${duplicates.length} possible duplicate${duplicates.length === 1 ? '' : 's'}`}
          </span>
        </p>
        <p className="text-xs text-slate-600">Stripe is the real number — the CRM gets corrected to it.</p>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {mismatches.length > 0 && (
        <div className="mt-3 space-y-2">
          {mismatches.map((row) => (
            <div
              key={row.client.id}
              className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-white p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {row.client.name}
                  {done.has(row.client.id) && (
                    <Badge tone="success" className="ml-2">
                      updated
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  CRM bills <span className="font-semibold">{money(row.expected)}</span> · Stripe
                  collected <span className="font-semibold">{money(row.collected)}</span> in{' '}
                  {row.month}
                  {row.amounts.length > 1 && ` (${row.amounts.map((a) => money(a)).join(' + ')})`}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {withDuplicate.has(row.client.id)
                    ? 'This client also has a payment recorded twice, below, which inflates the Stripe figure. Clear that first — the fee may be correct already.'
                    : row.amountOff
                      ? `${row.difference > 0 ? 'Under' : 'Over'}-reporting this client by ${money(Math.abs(row.difference))} a month.`
                      : `The amount is right but Stripe sends ${row.amounts.length} charge${row.amounts.length === 1 ? '' : 's'}, not ${row.expectedCharges}.`}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                {row.suggestion && !withDuplicate.has(row.client.id) ? (
                  <Button
                    size="sm"
                    variant="dark"
                    disabled={busy === row.client.id}
                    onClick={() => applySuggestion(row)}
                  >
                    {busy === row.client.id ? 'Saving…' : 'Match Stripe'}
                  </Button>
                ) : (
                  <span className="text-xs text-slate-500">
                    {withDuplicate.has(row.client.id) ? 'Duplicate first' : 'Needs a look'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {duplicates.length > 0 && (
        <div className="mt-3 space-y-2">
          {duplicates.map((group) => (
            <div
              key={`${group.clientId}-${group.amount}-${group.paidDate}`}
              className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-white p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {group.clientName}
                  <span className="ml-1.5 font-normal text-slate-600">
                    {group.rows.length} × {money(group.amount)} on {group.paidDate}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {group.confident
                    ? 'One of these carries a Stripe invoice ID and one does not — the one without it looks like the same payment recorded a second time by the CSV import.'
                    : 'Neither row carries a Stripe ID, so there is nothing here to say which is real. Check Stripe before removing either.'}
                </p>
              </div>
              {group.confident && (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy === group.extras[0]?.id}
                  onClick={() => removeExtra(group)}
                >
                  {busy === group.extras[0]?.id ? 'Removing…' : 'Remove the extra'}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
