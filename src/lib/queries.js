import { supabase } from './supabaseClient'

// `is_internal` arrives with supabase/internal-businesses.sql. Until that runs,
// filtering on it makes PostgREST return 400 and every page listing clients
// goes blank. Probe for the column once and fall back to unfiltered — same
// reasoning as the deliverables guard in fetchDashboardData: a migration that
// has not been applied yet should degrade, not take the app down.
let internalColumnProbe = null

export function hasInternalColumn() {
  internalColumnProbe ||= supabase
    .from('clients')
    .select('is_internal')
    .limit(1)
    .then(({ error }) => !error)
  return internalColumnProbe
}

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

  // Excludes the businesses we run ourselves — they carry Meta data but are
  // not clients, so they never belong in a client list, a client count, or MRR.
  let clientsQuery = supabase.from('clients').select('*').order('date_added', { ascending: false })
  if (await hasInternalColumn()) clientsQuery = clientsQuery.eq('is_internal', false)

  const [clientsRes, kpisRes, intakeRes, setupRes] = await Promise.all([
    clientsQuery,
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
  let q = supabase
    .from('clients')
    .select('id, name, meta_ads_active, lsa_active, meta_ad_account_id')
    .eq('archived', false)
    .eq(field, false)
    .order('name')
  if (await hasInternalColumn()) q = q.eq('is_internal', false)

  const { data, error } = await q

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
  const embed = (await hasInternalColumn()) ? 'clients(name, is_internal)' : 'clients(name)'

  const { data, error } = await supabase
    .from('weekly_kpis')
    .select(`*, ${embed}`)
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
      live: isLive(a.status),
    }))
    .sort((x, y) => y.spend - x.spend)
}

// An ad still delivering. WITH_ISSUES counts as live: Meta flags a setup or
// policy problem but the ad keeps spending — Comfort Experts' "Financing" ad
// is WITH_ISSUES and was its top spender.
export const LIVE_STATUSES = ['ACTIVE', 'WITH_ISSUES']

export function isLive(status) {
  return LIVE_STATUSES.includes(status)
}

function blankTotals(extra) {
  return { spend: 0, leads: 0, impressions: 0, clicks: 0, reach: 0, ...extra }
}

function accumulate(t, r) {
  t.spend += Number(r.spend) || 0
  t.leads += r.leads || 0
  t.impressions += r.impressions || 0
  t.clicks += r.clicks || 0
  t.reach += r.reach || 0
}

// Campaign -> ad set -> ad, each level carrying its own totals.
//
// Reach is summed for ads but deliberately not surfaced above ad level: Meta
// dedupes reach across an audience, so adding two ads' reach counts the same
// person twice. Spend, leads, impressions and clicks are all genuinely additive.
export function groupCampaigns(rows) {
  // Rows whose campaign_id never got written group together under a placeholder
  // rather than vanishing. It is not a real Meta campaign, and an ad that has
  // both attributed and unattributed rows will show up in both places with its
  // spend split, which is the visible symptom of a sync that dropped the field.
  const campaigns = new Map()

  for (const r of rows) {
    const cId = r.campaign_id || 'unknown'
    let c = campaigns.get(cId)
    if (!c) {
      c = blankTotals({ id: cId, name: r.campaign_name || 'No campaign recorded', adsets: new Map() })
      campaigns.set(cId, c)
    }
    accumulate(c, r)

    const aId = r.adset_id || 'unknown'
    let a = c.adsets.get(aId)
    if (!a) {
      a = blankTotals({ id: aId, name: r.adset_name || 'No ad set recorded', ads: new Map() })
      c.adsets.set(aId, a)
    }
    accumulate(a, r)

    let ad = a.ads.get(r.ad_id)
    if (!ad) {
      ad = blankTotals({
        ad_id: r.ad_id,
        ad_name: r.ad_name,
        status: r.effective_status,
        videoPlays: 0,
        videoThruplays: 0,
        hasThruplays: false,
        watchSecondsSum: 0,
        watchPlays: 0,
      })
      a.ads.set(r.ad_id, ad)
    }
    accumulate(ad, r)
    if (r.video_plays != null) ad.videoPlays += r.video_plays
    if (r.video_thruplays != null) {
      ad.videoThruplays += r.video_thruplays
      ad.hasThruplays = true
    }
    if (r.video_avg_watch_seconds != null && r.video_plays) {
      ad.watchSecondsSum += Number(r.video_avg_watch_seconds) * r.video_plays
      ad.watchPlays += r.video_plays
    }
  }

  const finishAd = (ad) => ({
    ...withDerived(ad),
    isVideo: ad.videoPlays > 0,
    holdRate: ad.videoPlays > 0 && ad.hasThruplays ? (ad.videoThruplays / ad.videoPlays) * 100 : null,
    avgWatch: ad.watchPlays > 0 ? ad.watchSecondsSum / ad.watchPlays : null,
    live: isLive(ad.status),
  })

  return [...campaigns.values()]
    .map((c) => {
      const adsets = [...c.adsets.values()]
        .map((a) => {
          const ads = [...a.ads.values()].map(finishAd).sort((x, y) => y.spend - x.spend)
          return {
            ...withDerived(a),
            ads,
            liveAds: ads.filter((x) => x.live).length,
          }
        })
        .sort((x, y) => y.spend - x.spend)

      const ads = adsets.flatMap((a) => a.ads)
      return {
        ...withDerived(c),
        adsets,
        adCount: ads.length,
        liveAds: ads.filter((x) => x.live).length,
      }
    })
    .sort((a, b) => b.spend - a.spend)
}

// Reports "Live ads" mode reads ad_daily instead of weekly_kpis, because ad
// status only exists per ad. That is safe precisely because live ads are recent
// by definition — the per-ad history covers every currently-running ad. Where
// it does not reach as far back as weekly_kpis is old paused ads, which this
// mode excludes anyway.
/**
 * Per-ad daily rows for a date range.
 *
 * Status is returned rather than filtered so the caller can switch between live
 * and all-time in memory. Refetching on a toggle would make the scope buttons
 * feel like page loads, and the two scopes want the same rows anyway.
 */
export async function fetchAdRowsForRange(since) {
  let q = supabase
    .from('ad_daily')
    .select('client_id, date, spend, leads, impressions, clicks, effective_status, clients(name, is_internal)')
    .order('date', { ascending: true })

  if (since) q = q.gte('date', since)

  const { data, error } = await q
  if (error) throw error
  return data || []
}
