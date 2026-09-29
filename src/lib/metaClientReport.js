// One client's Meta ads, laid out like the Ads Manager overview: scorecards
// you pick from, the picked metrics over time, then campaigns, ad sets, ads,
// placements and days in tables.
//
// Everything adds up ad_daily (one row per ad per day), the same rows the
// Meta report and the client page read, so the totals match. Reach is left
// out for the reason metaReport.js gives: daily reach cannot be summed.
//
// Pure: scripts/check-meta-client-report.mjs imports it.

import { adsToActOn, metaCampaignReport, metaKpis, platformSplit } from './metaReport.js'
import { dateRange } from './clientReportKit.js'

/** The scorecards, in Ads Manager's order. `kind` picks the formatter. */
export const META_CLIENT_METRICS = [
  { key: 'spend', label: 'Amount spent', kind: 'money' },
  { key: 'leads', label: 'Leads', kind: 'int' },
  { key: 'cpl', label: 'Cost per lead', kind: 'usd', lowerIsBetter: true },
  { key: 'impressions', label: 'Impressions', kind: 'int' },
  { key: 'clicks', label: 'Link clicks', kind: 'int' },
  { key: 'ctr', label: 'CTR', kind: 'pct' },
  { key: 'cpc', label: 'Cost per click', kind: 'usd', lowerIsBetter: true },
  { key: 'cpm', label: 'CPM', kind: 'usd', lowerIsBetter: true },
]

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100
const scoped = (rows, since, until) =>
  (rows || []).filter((r) => {
    const d = String(r.date || '')
    return d >= since && (!until || d <= until)
  })
const newestOf = (list) => list.reduce((a, b) => (String(b.date) > String(a.date) ? b : a), list[0])
const isActive = (s) => String(s || '').toUpperCase() === 'ACTIVE'

/** One entry per day in the window with every KPI, zeros on quiet days. */
export function metaDayTotals(rows, since, until) {
  const byDay = new Map()
  for (const r of scoped(rows, since, until)) {
    if (!byDay.has(r.date)) byDay.set(r.date, [])
    byDay.get(r.date).push(r)
  }
  return dateRange(since, until).map((date) => ({ date, ...metaKpis(byDay.get(date) || []) }))
}

/** This client's campaigns, biggest spend first. */
export function metaCampaignsFor(client, rows, since, until) {
  return metaCampaignReport(rows, [{ id: client.id, name: client.name }], since, until)
}

/** Ad sets, biggest spend first. */
export function adSetsFor(rows, since, until) {
  const groups = new Map()
  for (const r of scoped(rows, since, until)) {
    const key = String(r.adset_id || r.adset_name || '?')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  const out = []
  for (const [id, list] of groups) {
    const k = metaKpis(list)
    if (k.spend <= 0 && k.leads <= 0 && k.impressions <= 0) continue
    const newest = newestOf(list)
    out.push({
      id,
      name: newest.adset_name || '(unnamed ad set)',
      campaign: newest.campaign_name || '',
      ads: new Set(list.map((r) => r.ad_id)).size,
      liveAds: new Set(list.filter((r) => isActive(r.effective_status)).map((r) => r.ad_id)).size,
      ...k,
    })
  }
  return out.sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name))
}

/**
 * Every ad, with the same verdicts as the Meta report, judged against this
 * client's own cost per lead. Video ads also get the hold rate: the share of
 * people who stopped for 2 seconds that watched to the end.
 */
export function adsFor(client, rows, since, until) {
  const list = scoped(rows, since, until)
  const verdicts = new Map(adsToActOn(list, [{ id: client.id, name: client.name }], { since, until }).map((a) => [a.adId, a]))
  const groups = new Map()
  for (const r of list) {
    const key = String(r.ad_id || '?')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  const out = []
  for (const [id, ads] of groups) {
    const k = metaKpis(ads)
    if (k.spend <= 0 && k.leads <= 0 && k.impressions <= 0) continue
    const newest = newestOf(ads)
    const hooks = ads.reduce((s, r) => s + Number(r.video_2s_views || 0), 0)
    const ends = ads.reduce((s, r) => s + Number(r.video_p100 || 0), 0)
    const v = verdicts.get(id)
    out.push({
      id,
      name: newest.ad_name || '(unnamed ad)',
      adSet: newest.adset_name || '',
      campaign: newest.campaign_name || '',
      live: isActive(newest.effective_status),
      status: String(newest.effective_status || '').toUpperCase(),
      isVideo: ads.some((r) => r.video_2s_views != null),
      holdRate: hooks > 0 ? r2((ends / hooks) * 100) : 0,
      verdict: v?.verdict || '',
      why: v?.why || '',
      ...k,
    })
  }
  return out.sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name))
}

/** Where this client's money went by surface: Facebook, Instagram and the rest. */
export function placementsFor(client, platformRows, since, until) {
  return platformSplit(
    (platformRows || []).filter((r) => r.client_id === client.id),
    [{ id: client.id, name: client.name }],
    since,
    until
  )
}
