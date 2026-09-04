import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { money } from '../lib/queries'
import { duplicateSuspects, feeMismatches } from '../lib/reconcile'
import { Badge, Button, Card } from './ui'

/**
 * Where the CRM disagrees with Stripe.
 *
 * Stripe is the record of what people actually pay; the fee on a client row is
 * only what somebody typed, and it drifts. Two clients moved onto a $1,500
 * package and nobody updated the CRM, so MRR under-reported them for a month
 * before anyone noticed. This is what makes that kind of drift visible on the
 * page where the money lives, rather than leaving it to be spotted by eye.
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
    if (
      !confirm(
        `Set ${row.client.name}'s monthly fee to ${money(s.monthly_fee)}?\n\n` +
          `That is what Stripe collected from them in ${row.month}. It changes the fee on the client, not any payment already recorded.`
      )
    )
      return

    setBusy(row.client.id)
    setError('')
    try {
      const { error: err } = await supabase
        .from('clients')
        .update({ monthly_fee: s.monthly_fee })
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
        `Delete one of the ${money(group.amount)} payments for ${group.clientName} on ${group.paidDate}?\n\n` +
          `${group.reason}\n\n` +
          `This permanently deletes a payment record and takes ${money(group.amount)} off what this client has paid. If both charges are real, press Cancel and use "Both are real" instead.`
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

  /**
   * Records that a group really is two payments, so it stops being flagged.
   *
   * Written to the rows rather than held in this component: the payment rows
   * are permanent, so hiding the warning without recording the judgement would
   * show it again on the next page load. That is the opposite of dismissing an
   * unmatched Stripe payment, which deliberately remembers nothing so that
   * money always resurfaces until somebody matches it — here the money is
   * already matched and it is the warning that is wrong.
   *
   * Marks every row in the group. A third charge landing in the same group
   * later is not marked, so the warning comes back for it, which is what
   * should happen — that row is new information.
   */
  const confirmBothReal = async (group) => {
    setBusy(group.keep.id)
    setError('')
    try {
      const { error: err } = await supabase
        .from('payments')
        .update({ duplicate_reviewed_at: new Date().toISOString() })
        .in(
          'id',
          group.rows.map((r) => r.id)
        )
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
                    : `${row.difference > 0 ? 'Under' : 'Over'}-reporting this client by ${money(Math.abs(row.difference))} a month.`}
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
                <p className="mt-0.5 text-xs text-slate-600">{group.reason}</p>
              </div>
              {/* "Both are real" comes first, and is the only action offered
                  unless the rows actually point at a double-import. Deleting a
                  payment is the irreversible one of the two, and two identical
                  charges on one day are a real thing that happens. */}
              <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === group.keep.id}
                  onClick={() => confirmBothReal(group)}
                >
                  {busy === group.keep.id
                    ? 'Saving…'
                    : group.rows.length > 2
                      ? 'All are real'
                      : 'Both are real'}
                </Button>
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
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
