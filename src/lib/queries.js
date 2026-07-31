import { supabase } from './supabaseClient'

// ---------- date helpers ----------
// Built from local date parts on purpose — toISOString() shifts to UTC and can
// land on the wrong day for anyone west of Greenwich.
export function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  d.setHours(0, 0, 0, 0)
  return d
}

export function today() {
  return formatDate(new Date())
}

export function weeksAgoMonday(weeks) {
  const monday = getMonday(new Date())
  monday.setDate(monday.getDate() - weeks * 7)
  return formatDate(monday)
}

export function shortWeekLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function money(n) {
  return `$${(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

// A payment counts as overdue when it is unpaid and its due date has passed,
// regardless of what the stored status column says — nothing sweeps the table.
export function isOverdue(payment) {
  return payment.status !== 'paid' && payment.due_date < today()
}

// ---------- clients ----------
export async function fetchClientsWithKPIs() {
  const thisMonday = formatDate(getMonday(new Date()))

  const [clientsRes, kpisRes] = await Promise.all([
    supabase.from('clients').select('*').order('date_added', { ascending: false }),
    supabase.from('weekly_kpis').select('*').eq('week_of', thisMonday),
  ])

  if (clientsRes.error) throw clientsRes.error
  if (kpisRes.error) throw kpisRes.error

  const kpisByClient = {}
  for (const kpi of kpisRes.data || []) {
    ;(kpisByClient[kpi.client_id] ||= []).push(kpi)
  }

  return (clientsRes.data || []).map((client) => {
    const kpis = kpisByClient[client.id] || []
    const sum = (channel, field) =>
      kpis.filter((k) => k.channel === channel).reduce((t, k) => t + (k[field] || 0), 0)

    const metaSpend = sum('Meta', 'ad_spend')
    const metaLeads = sum('Meta', 'leads')
    const lsaSpend = sum('LSA', 'ad_spend')
    const lsaLeads = sum('LSA', 'leads')
    const totalSpend = metaSpend + lsaSpend
    const totalLeads = metaLeads + lsaLeads

    return {
      ...client,
      thisWeekMetaSpend: metaSpend,
      thisWeekMetaLeads: metaLeads,
      thisWeekLsaSpend: lsaSpend,
      thisWeekLsaLeads: lsaLeads,
      thisWeekTotalSpend: totalSpend,
      thisWeekTotalLeads: totalLeads,
      thisWeekCostPerLead: totalLeads > 0 ? totalSpend / totalLeads : 0,
      hasMissingKPIs: client.status === 'active' && totalSpend === 0 && totalLeads === 0,
    }
  })
}

// ---------- deliverables ----------
export async function fetchDeliverables() {
  const { data, error } = await supabase
    .from('deliverables')
    .select('*, clients(name)')
    .order('due_date', { ascending: true, nullsFirst: false })

  if (error) throw error
  return data || []
}

// ---------- payments ----------
export async function fetchPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select('*, clients(name)')
    .order('due_date', { ascending: true })

  if (error) throw error
  return data || []
}

// ---------- reports ----------
export async function fetchKPIHistory(weeks = 12) {
  const { data, error } = await supabase
    .from('weekly_kpis')
    .select('*, clients(name)')
    .gte('week_of', weeksAgoMonday(weeks - 1))
    .order('week_of', { ascending: true })

  if (error) throw error
  return data || []
}

// ---------- dashboard ----------
// One round trip for everything the home screen needs to tell you what to do today.
export async function fetchDashboardData() {
  const [clients, payments, kpis] = await Promise.all([
    fetchClientsWithKPIs(),
    fetchPayments(),
    fetchKPIHistory(2),
  ])

  let deliverables = []
  try {
    deliverables = await fetchDeliverables()
  } catch {
    // Table not created yet — the rest of the dashboard still works.
    deliverables = []
  }

  return { clients, payments, deliverables, kpis }
}
