// The Google Search report, as rules: rows in, one page's numbers out.
//
// Three tables feed it and each answers a different question:
//
//   google_campaign_daily     -> the true totals, every campaign type. This is
//                                what the tiles, the chart and the per-client
//                                and per-campaign tables add up.
//   google_keyword_daily      -> which of the things we bid on are losing.
//   google_search_term_daily  -> which of the things people typed we should
//                                stop paying for.
//
// The keyword and search-term numbers are NEVER added to the campaign totals
// and never to each other: Google withholds the search term on a large share
// of clicks, and keyword grain misses every non-Search campaign. They sit
// beside the totals as "what to act on", not as a second version of them.
//
// Everything is pure. No Supabase, no clock, so the check script can pin a
// window and assert.

import { diagnoseKeywords, negativeCandidates } from './googleSearchRules.js'

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100

/** Rows on or after `since` and, if given, on or before `until`. */
export function inRange(rows, since, until) {
  return (rows || []).filter((r) => {
    const d = String(r.date || '')
    return (!since || d >= since) && (!until || d <= until)
  })
}

/**
 * Every KPI the page shows, from any rows carrying cost, clicks, impressions,
 * conversions and conversion_value. Rates are per cent; ratios are 0 when the
 * denominator is 0, and the page prints those as a dash.
 */
export function kpis(rows) {
  let spend = 0
  let leads = 0
  let clicks = 0
  let impressions = 0
  let value = 0
  for (const r of rows || []) {
    spend += Number(r.cost || 0)
    leads += Number(r.conversions || 0)
    clicks += Number(r.clicks || 0)
    impressions += Number(r.impressions || 0)
    value += Number(r.conversion_value || 0)
  }
  return {
    spend: r2(spend),
    leads: Math.round(leads * 10) / 10,
    clicks,
    impressions,
    value: r2(value),
    cpl: leads > 0 ? r2(spend / leads) : 0,
    cpc: clicks > 0 ? r2(spend / clicks) : 0,
    ctr: impressions > 0 ? r2((clicks / impressions) * 100) : 0,
    convRate: clicks > 0 ? r2((leads / clicks) * 100) : 0,
    roas: spend > 0 ? r2(value / spend) : 0,
  }
}

/** Campaign rows in the shape buildDailySeries wants. */
export function dailyRows(campaignRows) {
  return (campaignRows || []).map((r) => ({
    date: r.date,
    spend: Number(r.cost || 0),
    leads: Number(r.conversions || 0),
    clicks: Number(r.clicks || 0),
    impressions: Number(r.impressions || 0),
  }))
}

/**
 * Who is reporting, who has an ID Google refuses, and who has no ID yet.
 * Clients only. A saved ID is not the same as access: the last sync's error
 * on the client row is what tells them apart.
 */
export function connection(clients) {
  const mine = (clients || []).filter((c) => !c.archived && !c.is_internal)
  const hasId = (c) => Boolean(String(c.google_ads_customer_id || '').replace(/\D/g, ''))
  const byName = (a, b) => String(a.name).localeCompare(String(b.name))
  return {
    connected: mine.filter((c) => hasId(c) && !c.google_ads_sync_error).sort(byName),
    noAccess: mine.filter((c) => hasId(c) && c.google_ads_sync_error).sort(byName),
    waiting: mine.filter((c) => !hasId(c)).sort(byName),
    total: mine.length,
  }
}

/** The newest synced_at across rows, or null. */
export function lastSynced(rows) {
  let max = null
  for (const r of rows || []) {
    const t = r.synced_at ? String(r.synced_at) : ''
    if (t && (!max || t > max)) max = t
  }
  return max
}

/**
 * One row per client, the whole story: the totals, what is wasted, and
 * whether they are connected at all. Clients with spend first, biggest
 * first; connected-but-empty next; not connected last. Internal businesses
 * and archived clients are left out, as on the rest of Reports.
 */
export function clientReport({ clients, campaignRows, keywordRows, termRows, since, until }) {
  const scopedCampaigns = inRange(campaignRows, since, until)
  const keywords = diagnoseKeywords(keywordRows || [], { since })
  const terms = negativeCandidates(termRows || [], { since })

  const campaignsBy = new Map()
  for (const r of scopedCampaigns) {
    if (!campaignsBy.has(r.client_id)) campaignsBy.set(r.client_id, [])
    campaignsBy.get(r.client_id).push(r)
  }
  const wasteBy = new Map()
  for (const k of keywords) {
    const w = wasteBy.get(k.clientId) || { dead: 0, wasted: 0, winners: 0 }
    if (k.verdict === 'waste') {
      w.dead += 1
      w.wasted += k.cost
    }
    if (k.verdict === 'winner') w.winners += 1
    wasteBy.set(k.clientId, w)
  }
  const termsBy = new Map()
  for (const t of terms) {
    const w = termsBy.get(t.clientId) || { blockable: 0, savable: 0 }
    w.blockable += 1
    w.savable += t.cost
    termsBy.set(t.clientId, w)
  }

  const out = []
  for (const c of clients || []) {
    if (c.archived || c.is_internal) continue
    const connected = Boolean(String(c.google_ads_customer_id || '').replace(/\D/g, ''))
    const rows = campaignsBy.get(c.id) || []
    const k = kpis(rows)
    const campaignIds = new Set(rows.map((r) => r.campaign_id))
    const active = new Set(rows.filter((r) => String(r.campaign_status || '').toUpperCase() === 'ENABLED').map((r) => r.campaign_id))
    const w = wasteBy.get(c.id) || { dead: 0, wasted: 0, winners: 0 }
    const t = termsBy.get(c.id) || { blockable: 0, savable: 0 }
    let lastDate = ''
    for (const r of rows) if (String(r.date) > lastDate) lastDate = String(r.date)
    out.push({
      id: c.id,
      name: c.name,
      connected,
      paused: Boolean(c.paused_at),
      hasData: rows.length > 0,
      ...k,
      campaigns: campaignIds.size,
      activeCampaigns: active.size,
      deadKeywords: w.dead,
      wasted: r2(w.wasted),
      winners: w.winners,
      blockable: t.blockable,
      savable: r2(t.savable),
      lastDate,
      syncError: c.google_ads_sync_error || '',
      synced: Boolean(c.google_ads_synced_at),
      // Data in the window wins over a stale error: it proves access worked.
      state: !connected
        ? 'not-connected'
        : rows.length > 0
          ? 'live'
          : c.google_ads_sync_error
            ? 'no-access'
            : 'no-data',
    })
  }
  const rank = { live: 0, 'no-access': 1, 'no-data': 2, 'not-connected': 3 }
  return out.sort(
    (a, b) => rank[a.state] - rank[b.state] || b.spend - a.spend || String(a.name).localeCompare(String(b.name))
  )
}

/** One row per campaign across every client, biggest spend first. */
export function campaignReport(campaignRows, clients, since, until) {
  const byName = new Map((clients || []).map((c) => [c.id, c.name]))
  const skip = new Set((clients || []).filter((c) => c.archived || c.is_internal).map((c) => c.id))
  const groups = new Map()
  for (const r of inRange(campaignRows, since, until)) {
    if (skip.has(r.client_id)) continue
    const key = `${r.client_id}|${r.campaign_id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  const out = []
  for (const [key, rows] of groups) {
    // The newest row names the campaign: a renamed campaign keeps its id.
    const newest = rows.reduce((a, b) => (String(b.date) > String(a.date) ? b : a), rows[0])
    out.push({
      key,
      clientId: newest.client_id,
      clientName: byName.get(newest.client_id) || 'Unknown',
      campaignId: newest.campaign_id,
      name: newest.campaign_name || '(unnamed)',
      type: prettyType(newest.campaign_type),
      status: String(newest.campaign_status || '').toUpperCase(),
      ...kpis(rows),
    })
  }
  return out.sort((a, b) => b.spend - a.spend || a.clientName.localeCompare(b.clientName))
}

const TYPES = {
  SEARCH: 'Search',
  PERFORMANCE_MAX: 'Performance Max',
  DISPLAY: 'Display',
  VIDEO: 'Video',
  SHOPPING: 'Shopping',
  LOCAL_SERVICES: 'Local Services',
  DEMAND_GEN: 'Demand Gen',
  SMART: 'Smart',
  MULTI_CHANNEL: 'App',
}

export function prettyType(t) {
  const key = String(t || '').toUpperCase()
  if (!key) return ''
  return TYPES[key] || key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' ')
}

/** Keyword verdicts across every client, each row naming its client. */
export function keywordsAcross(keywordRows, clients, since) {
  const byName = new Map((clients || []).map((c) => [c.id, c.name]))
  return diagnoseKeywords(keywordRows || [], { since }).map((k) => ({ ...k, clientName: byName.get(k.clientId) || 'Unknown' }))
}

/** Search terms worth blocking across every client, each naming its client. */
export function negativesAcross(termRows, clients, since) {
  const byName = new Map((clients || []).map((c) => [c.id, c.name]))
  return negativeCandidates(termRows || [], { since }).map((t) => ({ ...t, clientName: byName.get(t.clientId) || 'Unknown' }))
}

/** Type share of spend, for the "where the money goes" strip. */
export function spendByType(campaignRows, clients, since, until) {
  const skip = new Set((clients || []).filter((c) => c.archived || c.is_internal).map((c) => c.id))
  const by = new Map()
  let total = 0
  for (const r of inRange(campaignRows, since, until)) {
    if (skip.has(r.client_id)) continue
    const t = prettyType(r.campaign_type) || 'Other'
    const cost = Number(r.cost || 0)
    by.set(t, (by.get(t) || 0) + cost)
    total += cost
  }
  return [...by.entries()]
    .map(([type, spend]) => ({ type, spend: r2(spend), share: total > 0 ? r2((spend / total) * 100) : 0 }))
    .sort((a, b) => b.spend - a.spend)
}
