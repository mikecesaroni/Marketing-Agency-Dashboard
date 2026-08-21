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

// Clients start paying before onboarding finishes, so MRR can't wait on the
// status reaching 'active'. It counts anyone who has a monthly schedule and
// hasn't churned — the schedule existing is what proves they're billing, since
// monthly_fee carries a column default and is set on every client row.
export function calcMRR(clients, payments) {
  const scheduled = new Set(
    payments.filter((p) => p.payment_type === 'monthly').map((p) => p.client_id)
  )
  const billing = clients.filter((c) => scheduled.has(c.id) && !c.archived && !c.is_internal)
  return {
    mrr: billing.reduce((sum, c) => sum + (c.monthly_fee || 0), 0),
    count: billing.length,
  }
}

// A payment counts as overdue when it is unpaid and its due date has passed,
// regardless of what the stored status column says — nothing sweeps the table.
export function isOverdue(payment) {
  return payment.status !== 'paid' && payment.due_date < today()
}

// ---------- clients ----------
export async function fetchClientsWithKPIs() {
  const thisMonday = formatDate(getMonday(new Date()))

  const [clientsRes, kpisRes, intakeRes, setupRes] = await Promise.all([
    // is_internal excludes the businesses we run ourselves — they carry Meta
    // data but are not clients, so they never belong in a client list, a
    // client count, or MRR.
    supabase
      .from('clients')
      .select('*')
      .eq('is_internal', false)
      .order('date_added', { ascending: false }),
    supabase.from('weekly_kpis').select('*').eq('week_of', thisMonday),
    supabase.from('onboarding_intake').select('client_id, owner_name, industry_trade, service_area'),
    supabase
      .from('payments')
      .select('client_id, amount, status, due_date')
      .eq('payment_type', 'setup'),
  ])

  if (clientsRes.error) throw clientsRes.error
  if (kpisRes.error) throw kpisRes.error

  // A setup fee can be split across more than one payment, so these are
  // collected per client rather than assuming a single row.
  const setupByClient = {}
  for (const row of setupRes.data || []) {
    ;(setupByClient[row.client_id] ||= []).push(row)
  }

  // Industry and market are captured on the intake call, so the intake record
  // is the source of truth — the columns on `clients` are only a fallback for
  // clients whose intake hasn't been filled in yet.
  const intakeByClient = {}
  for (const row of intakeRes.data || []) {
    intakeByClient[row.client_id] = row
  }

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

    const intake = intakeByClient[client.id]

    // No setup row means either no billing set up yet or a client with no setup
    // fee at all — both read as "nothing owed", so neither shows a status.
    const setup = setupByClient[client.id] || []
    const paidParts = setup.filter((p) => p.status === 'paid')

    let setupFeeStatus = null
    if (setup.length > 0) {
      if (paidParts.length === setup.length) setupFeeStatus = 'paid'
      else if (paidParts.length > 0) setupFeeStatus = 'partial'
      else if (setup.some(isOverdue)) setupFeeStatus = 'overdue'
      else setupFeeStatus = 'unpaid'
    }

    return {
      setupFeeStatus,
      setupFeeAmount: setup.reduce((sum, p) => sum + (p.amount || 0), 0) || null,
      setupFeePaidAmount: paidParts.reduce((sum, p) => sum + (p.amount || 0), 0),
      ...client,
      industry: intake?.industry_trade || client.industry || '',
      market: intake?.service_area || client.market || '',
      ownerName: intake?.owner_name || '',
      thisWeekMetaSpend: metaSpend,
      thisWeekMetaLeads: metaLeads,
      thisWeekLsaSpend: lsaSpend,
      thisWeekLsaLeads: lsaLeads,
      thisWeekTotalSpend: totalSpend,
      thisWeekTotalLeads: totalLeads,
      thisWeekCostPerLead: totalLeads > 0 ? totalSpend / totalLeads : 0,
      // Only worth flagging once Meta is actually live — a client whose ads
      // haven't launched has no KPIs to be missing.
      hasMissingKPIs:
        client.meta_ads_active && !client.archived && totalSpend === 0 && totalLeads === 0,
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

// ---------- channel setup tracking ----------
// Everyone whose given channel isn't live yet. Reads the flags on the client
// rather than the intake form, so there's one answer to "is this channel on".
export async function fetchChannelSetupNeeded(field) {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, meta_ads_active, lsa_active, meta_ad_account_id')
    .eq('archived', false)
    .eq('is_internal', false)
    .eq(field, false)
    .order('name')

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
    .select('*, clients(name, is_internal)')
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

// ---------- per-ad performance ----------
export async function fetchAdDaily(clientId, since) {
  let q = supabase
    .from('ad_daily')
    .select('*')
    .eq('client_id', clientId)
    .order('date', { ascending: true })

  if (since) q = q.gte('date', since)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

// Rolls daily rows into weeks (Monday-keyed, matching weekly_kpis) or calendar
// months. Daily storage is what makes both exact — bucketing weekly rows into
// months would misplace every week that straddles a month boundary.
export function bucketByPeriod(rows, period) {
  const buckets = new Map()

  for (const r of rows) {
    const [y, m, d] = r.date.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    const key =
      period === 'month'
        ? `${y}-${String(m).padStart(2, '0')}-01`
        : formatDate(getMonday(dt))

    const b = buckets.get(key) || {
      key,
      spend: 0,
      leads: 0,
      impressions: 0,
      clicks: 0,
      reach: 0,
    }
    b.spend += Number(r.spend) || 0
    b.leads += r.leads || 0
    b.impressions += r.impressions || 0
    b.clicks += r.clicks || 0
    b.reach += r.reach || 0
    buckets.set(key, b)
  }

  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)).map(withDerived)
}

// Rates are computed from the totals, never averaged from daily rates — an
// average of ratios weights a $2 day the same as a $200 one.
export function withDerived(t) {
  return {
    ...t,
    cpl: t.leads > 0 ? t.spend / t.leads : 0,
    ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
    cpc: t.clicks > 0 ? t.spend / t.clicks : 0,
    cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0,
  }
}

export function summariseAds(rows) {
  const byAd = new Map()

  for (const r of rows) {
    const a = byAd.get(r.ad_id) || {
      ad_id: r.ad_id,
      ad_name: r.ad_name,
      status: r.effective_status,
      spend: 0,
      leads: 0,
      impressions: 0,
      clicks: 0,
      reach: 0,
      videoPlays: 0,
      videoThruplays: 0,
      hasThruplays: false,
      watchSecondsSum: 0,
      watchPlays: 0,
    }
    a.spend += Number(r.spend) || 0
    a.leads += r.leads || 0
    a.impressions += r.impressions || 0
    a.clicks += r.clicks || 0
    a.reach += r.reach || 0
    if (r.video_plays != null) a.videoPlays += r.video_plays
    if (r.video_thruplays != null) {
      a.videoThruplays += r.video_thruplays
      a.hasThruplays = true
    }
    // Weighted by that day's plays, not averaged across days. Meta reports an
    // average per day, and a day with 3 plays must not count as heavily as a
    // day with 2,000 — that read 8.3s on an ad nobody actually watched.
    if (r.video_avg_watch_seconds != null && r.video_plays) {
      a.watchSecondsSum += Number(r.video_avg_watch_seconds) * r.video_plays
      a.watchPlays += r.video_plays
    }
    byAd.set(r.ad_id, a)
  }

  return [...byAd.values()]
    .map((a) => ({
      ...withDerived(a),
      // Null rather than zero for image ads: "no video" and "nobody watched"
      // are different findings and shouldn't look the same in a table.
      isVideo: a.videoPlays > 0,
      // Plays without any reported thruplay is missing data, not a 0% hold —
      // dividing anyway would claim nobody watched past the hook.
      holdRate: a.videoPlays > 0 && a.hasThruplays ? (a.videoThruplays / a.videoPlays) * 100 : null,
      avgWatch: a.watchPlays > 0 ? a.watchSecondsSum / a.watchPlays : null,
    }))
    .sort((x, y) => y.spend - x.spend)
}
