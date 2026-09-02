import { supabase } from './supabaseClient'

// Reading and writing the two money tables. The arithmetic lives in
// partnerSplit.js and never touches the network; this never does arithmetic.
// Keeping that line clean is what lets the split be tested without a database.

export const SPLIT_KEY = 'ethan_split_percent'
const DEFAULT_SPLIT_PERCENT = 50

export async function fetchSplitPercent() {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SPLIT_KEY)
    .maybeSingle()
  const n = parseFloat(data?.value)
  return Number.isFinite(n) && n > 0 && n < 100 ? n : DEFAULT_SPLIT_PERCENT
}

export async function saveSplitPercent(percent) {
  const { error } = await supabase.from('app_settings').upsert(
    { key: SPLIT_KEY, value: String(percent), updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )
  if (error) throw error
}

// ---------- expenses -------------------------------------------------------
export async function fetchExpenses() {
  const { data, error } = await supabase
    .from('expenses')
    .select('*, clients(name)')
    .order('spent_on', { ascending: false })
  if (error) throw error
  return data || []
}

export async function addExpense(row) {
  const { error } = await supabase.from('expenses').insert({
    spent_on: row.spent_on,
    amount: row.amount,
    payee: row.payee.trim(),
    category: row.category,
    shared: row.shared,
    paid_by: row.paid_by,
    client_id: row.client_id || null,
    notes: row.notes?.trim() || null,
  })
  if (error) throw error
}

export async function deleteExpense(id) {
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
}

// ---------- payouts --------------------------------------------------------
export async function fetchPayouts() {
  const { data, error } = await supabase
    .from('partner_payouts')
    .select('*')
    .order('paid_on', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Records a payment to a partner.
 *
 * Just the fact of the transfer -- who, how much, when, how. The balance is
 * derived from the totals every time it is read, so there is no snapshot of
 * the arithmetic to store and nothing to keep in step with it.
 */
export async function addPayout({ partner, amount, paidOn, method, notes }) {
  const { error } = await supabase.from('partner_payouts').insert({
    partner,
    amount,
    paid_on: paidOn,
    method: method?.trim() || null,
    notes: notes?.trim() || null,
  })
  if (error) throw error
}

export async function deletePayout(id) {
  const { error } = await supabase.from('partner_payouts').delete().eq('id', id)
  if (error) throw error
}
