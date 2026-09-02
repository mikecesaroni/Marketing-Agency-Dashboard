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
 * Records a payment to a partner, and marks what it covered.
 *
 * The transfer itself is just who, how much, when and how -- the balance is
 * derived from the totals every time it is read, so there is no snapshot of
 * the arithmetic to store. What DOES get stored is which payments and which
 * costs this transfer settled, so a list of payments can say which of them
 * have been dealt with.
 *
 * Through one Postgres function rather than three calls from here. The three
 * writes -- the payout, the payments, the expenses -- have to be all or
 * nothing: any two of them landing without the third is a wrong balance, and
 * the browser cannot open a transaction.
 */
export async function addPayout({
  partner,
  amount,
  paidOn,
  method,
  notes,
  paymentIds = [],
  expenseIds = [],
}) {
  // Empty lists are OMITTED rather than sent as []. The function defaults them
  // to '{}', and leaving PostgREST to infer the element type of an empty JSON
  // array for a uuid[] parameter is a needless thing to depend on -- and with
  // no expenses logged yet, the empty case is the one production takes.
  const args = {
    p_partner: partner,
    p_amount: amount,
    p_paid_on: paidOn,
    p_method: method || null,
    p_notes: notes || null,
  }
  if (paymentIds.length > 0) args.p_payment_ids = paymentIds
  if (expenseIds.length > 0) args.p_expense_ids = expenseIds

  const { data, error } = await supabase.rpc('record_partner_payout', args)
  if (error) throw error
  return data
}

export async function deletePayout(id) {
  const { error } = await supabase.from('partner_payouts').delete().eq('id', id)
  if (error) throw error
}
