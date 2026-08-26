import { supabase } from './supabaseClient'

// Reuses the same key/value settings table the Stripe payment links live in.
export const SPLIT_KEY = 'ethan_split_percent'
const DEFAULT_SPLIT_PERCENT = 50

export async function fetchSplitPercent() {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SPLIT_KEY)
    .maybeSingle()
  const n = parseFloat(data?.value)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SPLIT_PERCENT
}

export async function saveSplitPercent(percent) {
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { key: SPLIT_KEY, value: String(percent), updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )
  if (error) throw error
}

// Only a starting point for a row still waiting to be reconciled — never read
// once a row is marked, so a later change to the split percent can't rewrite
// what was actually sent.
export function suggestedSplit(payment, percent) {
  return Math.round(payment.amount * (percent / 100) * 100) / 100
}

/**
 * Marks a batch of payments as paid out to Ethan in one go.
 *
 * Each row can carry its own amount — the split percentage is a suggestion,
 * not a guarantee, so whatever was actually typed into that row is what gets
 * locked in.
 */
export async function markPaidOut(rows, date) {
  const results = await Promise.all(
    rows.map(({ id, amount }) =>
      supabase
        .from('payments')
        .update({ ethan_paid_out: true, ethan_paid_out_date: date, ethan_payout_amount: amount })
        .eq('id', id)
    )
  )
  const failed = results.find((r) => r.error)
  if (failed) throw failed.error
}

export async function unmarkPaidOut(id) {
  const { error } = await supabase
    .from('payments')
    .update({ ethan_paid_out: false, ethan_paid_out_date: null })
    .eq('id', id)
  if (error) throw error
}
