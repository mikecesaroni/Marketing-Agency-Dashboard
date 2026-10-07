// The Meta report, as rules: rows in, one page's numbers out.
//
// ad_daily is one row per ad per day. Everything here adds those up, so the
// totals on /reports/meta are the same numbers the hub and the client pages
// show. Reach is left out on purpose: a day's reach cannot be added to the
// next day's (the same person counts twice), and a summed reach would read
// as a real number that is not one.
//
// Pure: no Supabase, no clock unless passed in, so the check script can pin
// a window and assert.

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100

/** Rows on or after `since` and, if given, on or before `until`. */
export function inRange(rows, since, until) {
  return (rows || []).filter((r) => {
    const d = String(r.date || '')
    return (!since || d >= since) && (!until || d <= until)
  })
}

/**
 * Every KPI the page shows. Rates are per cent, CPM is per thousand
 * impressions, and a ratio with nothing under it is 0 (printed as a dash).
 * Hook rate is 2-second video views over impressions, counted only on rows
 * that report video, so image ads do not drag it down.
 */
export function metaKpis(rows) {
  let spend = 0
  let leads = 0
  let impressions = 0
  let clicks = 0
  let videoImpr = 0
  let hooks = 0
  for (const r of rows || []) {
    spend += Number(r.spend || 0)
    leads += Number(r.leads || 0)
    impressions += Number(r.impressions || 0)
    clicks += Number(r.clicks || 0)
    if (r.video_2s_views != null) {
      videoImpr += Number(r.impressions || 0)
      hooks += Number(r.video_2s_views || 0)
    }
  }
  return {
    spend: r2(spend),
    leads,
    impressions,
    clicks,
    cpl: leads > 0 ? r2(spend / leads) : 0,
    ctr: impressions > 0 ? r2((clicks / impressions) * 100) : 0,
    cpc: clicks > 0 ? r2(spend / clicks) : 0,
    cpm: impressions > 0 ? r2((spend / impressions) * 1000) : 0,
    convRate: clicks > 0 ? r2((leads / clicks) * 100) : 0,
    hookRate: videoImpr > 0 ? r2((hooks / videoImpr) * 100) : 0,
  }
}

const hasAccount = (c) => Boolean(String(c.meta_ad_account_id || '').replace(/\D/g, ''))

/** Who has a Meta ad account on file, and who does not. Clients only. */
export function metaConnection(clients) {
  const mine = (clients || []).filter((c) => !c.archived && !c.is_internal)
  const byName = (a, b) => String(a.name).localeCompare(String(b.name))
  return {
    connected: mine.filter(hasAccount).sort(byName),
    missing: mine.filter((c) => !hasAccount(c)).sort(byName),
    // Pixels, among clients that have an ad account (a pixel needs one to
    // report to). meta_pixel_id is filled nightly by meta-account-health
    // when the ad account has exactly one pixel.
    withPixel: mine.filter((c) => hasAccount(c) && hasPixel(c)).sort(byName),
    noPixel: mine.filter((c) => hasAccount(c) && !hasPixel(c)).sort(byName),
    total: mine.length,
  }
}

const hasPixel = (c) => Boolean(String(c.meta_pixel_id || '').replace(/\D/g, ''))

/** 'on-file', 'missing', or 'no-account' (nothing for a pixel to report to yet). */
export function pixelState(client) {
  if (!hasAccount(client)) return 'no-account'
  return hasPixel(client) ? 'on-file' : 'missing'
}

/**
 * One row per client: totals, active ads, and whether they are running at
 * all. Spending clients first, biggest first; an account with no spend in
 * the range next; no account last. Ours and archived are left out.
 */
export function metaClientReport({ clients, rows, since, until }) {
  const scoped = inRange(rows, since, until)
  const by = new Map()
  for (const r of scoped) {
    if (!by.has(r.client_id)) by.set(r.client_id, [])
    by.get(r.client_id).push(r)
  }
  const out = []
  for (const c of clients || []) {
    if (c.archived || c.is_internal) continue
    const mine = by.get(c.id) || []
    const k = metaKpis(mine)
    const ads = new Set(mine.filter((r) => Number(r.spend || 0) > 0).map((r) => r.ad_id))
    const live = new Set(mine.filter((r) => String(r.effective_status || '').toUpperCase() === 'ACTIVE').map((r) => r.ad_id))
    out.push({
      id: c.id,
      name: c.name,
      paused: Boolean(c.paused_at),
      pixelId: String(c.meta_pixel_id || ''),
      accountStatus: c.meta_account_status ?? null,
      pixel: pixelState(c),
      ...k,
      ads: ads.size,
      liveAds: live.size,
      state: !hasAccount(c) ? 'no-account' : k.spend > 0 ? 'live' : 'no-spend',
    })
  }
  const rank = { live: 0, 'no-spend': 1, 'no-account': 2 }
  return out.sort((a, b) => rank[a.state] - rank[b.state] || b.spend - a.spend || String(a.name).localeCompare(String(b.name)))
}

/** One row per campaign across every client, biggest spend first. */
export function metaCampaignReport(rows, clients, since, until) {
  const names = new Map((clients || []).map((c) => [c.id, c.name]))
  const skip = new Set((clients || []).filter((c) => c.archived || c.is_internal).map((c) => c.id))
  const groups = new Map()
  for (const r of inRange(rows, since, until)) {
    if (skip.has(r.client_id)) continue
    const key = `${r.client_id}|${r.campaign_id || r.campaign_name || '?'}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  const out = []
  for (const [key, list] of groups) {
    const newest = list.reduce((a, b) => (String(b.date) > String(a.date) ? b : a), list[0])
    const k = metaKpis(list)
    if (k.spend <= 0 && k.leads <= 0) continue
    out.push({
      key,
      clientId: newest.client_id,
      clientName: names.get(newest.client_id) || 'Unknown',
      name: newest.campaign_name || '(unnamed)',
      ads: new Set(list.map((r) => r.ad_id)).size,
      liveAds: new Set(list.filter((r) => String(r.effective_status || '').toUpperCase() === 'ACTIVE').map((r) => r.ad_id)).size,
      ...k,
    })
  }
  return out.sort((a, b) => b.spend - a.spend || a.clientName.localeCompare(b.clientName))
}

export const AD_RULES = {
  // Spend on one ad with no lead. A home services lead is worth far more
  // than this, but $75 with nothing is a fair run that did not work.
  deadSpend: 75,
  // Below this an ad has not had a fair run.
  minSpendToJudge: 25,
  // A winner has done it more than once.
  winnerLeads: 3,
  // Relative to the agency's own blended cost per lead for the range, so
  // "expensive" and "winner" move with the market instead of a fixed number.
  expensiveTimes: 2,
  winnerTimes: 0.75,
}

/**
 * Ads worth a decision, across every client. Verdicts, worst first:
 * 'dead' (spending, no leads), 'expensive' (leads, at over twice the
 * blended cost per lead), 'winner' (three or more at under three quarters
 * of it). Everything else is not listed.
 */
export function adsToActOn(rows, clients, { since, until, rules = AD_RULES } = {}) {
  const names = new Map((clients || []).map((c) => [c.id, c.name]))
  const skip = new Set((clients || []).filter((c) => c.archived || c.is_internal).map((c) => c.id))
  const scoped = inRange(rows, since, until).filter((r) => !skip.has(r.client_id))
  const blended = metaKpis(scoped).cpl
  const groups = new Map()
  for (const r of scoped) {
    const key = `${r.client_id}|${r.ad_id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  const out = []
  for (const [key, list] of groups) {
    const k = metaKpis(list)
    if (k.spend < rules.minSpendToJudge) continue
    const newest = list.reduce((a, b) => (String(b.date) > String(a.date) ? b : a), list[0])
    let verdict = null
    let why = ''
    if (k.leads === 0 && k.spend >= rules.deadSpend) {
      verdict = 'dead'
      why = `$${Math.round(k.spend)} and no leads`
    } else if (blended > 0 && k.leads > 0 && k.cpl > blended * rules.expensiveTimes) {
      verdict = 'expensive'
      why = `$${k.cpl.toFixed(2)} a lead, over ${rules.expensiveTimes}× the $${blended.toFixed(2)} average`
    } else if (blended > 0 && k.leads >= rules.winnerLeads && k.cpl <= blended * rules.winnerTimes) {
      verdict = 'winner'
      why = `${k.leads} leads at $${k.cpl.toFixed(2)}, well under the $${blended.toFixed(2)} average`
    }
    if (!verdict) continue
    out.push({
      key,
      clientId: newest.client_id,
      clientName: names.get(newest.client_id) || 'Unknown',
      adId: newest.ad_id,
      name: newest.ad_name || '(unnamed ad)',
      campaign: newest.campaign_name || '',
      live: String(newest.effective_status || '').toUpperCase() === 'ACTIVE',
      verdict,
      why,
      ...k,
    })
  }
  const rank = { dead: 0, expensive: 1, winner: 2 }
  return out.sort((a, b) => rank[a.verdict] - rank[b.verdict] || (a.verdict === 'winner' ? a.cpl - b.cpl : b.spend - a.spend))
}

const PLATFORM_NAMES = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  audience_network: 'Audience Network',
  messenger: 'Messenger',
  threads: 'Threads',
  whatsapp: 'WhatsApp',
  unknown: 'Not attributed',
}

/**
 * Where the money went by surface, with the cost per lead on each, from
 * the per-client roll-up of ad_platform_daily. Biggest spend first.
 */
export function platformSplit(rows, clients, since, until) {
  const skip = new Set((clients || []).filter((c) => c.archived || c.is_internal).map((c) => c.id))
  const by = new Map()
  let total = 0
  for (const r of inRange(rows, since, until)) {
    if (skip.has(r.client_id)) continue
    const key = String(r.platform || 'unknown')
    const x = by.get(key) || { spend: 0, leads: 0, impressions: 0, clicks: 0 }
    x.spend += Number(r.spend || 0)
    x.leads += Number(r.leads || 0)
    x.impressions += Number(r.impressions || 0)
    x.clicks += Number(r.clicks || 0)
    by.set(key, x)
    total += Number(r.spend || 0)
  }
  return [...by.entries()]
    .filter(([, x]) => x.spend > 0 || x.leads > 0)
    .map(([key, x]) => ({
      key,
      label: PLATFORM_NAMES[key] || key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
      spend: r2(x.spend),
      leads: x.leads,
      share: total > 0 ? r2((x.spend / total) * 100) : 0,
      cpl: x.leads > 0 ? r2(x.spend / x.leads) : 0,
      ctr: x.impressions > 0 ? r2((x.clicks / x.impressions) * 100) : 0,
    }))
    .sort((a, b) => b.spend - a.spend)
}
