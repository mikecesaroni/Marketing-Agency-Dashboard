// One client's Google Ads, laid out like Google Ads' own overview: metric
// tiles you pick from, the picked metrics over time, then campaigns, ad
// groups, keywords, search terms and days in tables.
//
// Same three tables as the all-clients report and the same rule about them:
// campaign grain is the truth for totals (every campaign type), keyword and
// search-term grain are for acting on and are never added in. Ad group rows
// here are built from keyword rows, so they only cover Search keywords, and
// the page says so.
//
// Pure: scripts/check-google-client-report.mjs imports it.

import { campaignReport, kpis } from './googleSearchReport.js'
import { dateRange } from './clientReportKit.js'
import { diagnoseKeywords, negativeCandidates } from './googleSearchRules.js'

/** The scorecards, in Google's order. `kind` picks the formatter. */
export const CLIENT_METRICS = [
  { key: 'clicks', label: 'Clicks', kind: 'int' },
  { key: 'impressions', label: 'Impressions', kind: 'int' },
  { key: 'ctr', label: 'CTR', kind: 'pct' },
  { key: 'cpc', label: 'Avg. CPC', kind: 'usd', lowerIsBetter: true },
  { key: 'spend', label: 'Cost', kind: 'money' },
  { key: 'leads', label: 'Conversions', kind: 'dec' },
  { key: 'cpl', label: 'Cost / conv.', kind: 'usd', lowerIsBetter: true },
  { key: 'convRate', label: 'Conv. rate', kind: 'pct' },
]




/** One entry per day in the window with every KPI, zeros on quiet days. */
export function dayTotals(campaignRows, since, until) {
  const byDay = new Map()
  for (const r of campaignRows || []) {
    const d = String(r.date || '')
    if (d < since || d > until) continue
    if (!byDay.has(d)) byDay.set(d, [])
    byDay.get(d).push(r)
  }
  return dateRange(since, until).map((date) => ({ date, ...kpis(byDay.get(date) || []) }))
}

/** This client's campaigns, biggest spend first. */
export function campaignsFor(client, campaignRows, since, until) {
  return campaignReport(campaignRows, [{ id: client.id, name: client.name }], since, until)
}

const withRates = (row) => ({
  ...row,
  ctr: row.impressions > 0 ? Math.round((row.clicks / row.impressions) * 10000) / 100 : 0,
  convRate: row.clicks > 0 ? Math.round((row.conversions / row.clicks) * 10000) / 100 : 0,
})

/** Ad groups, from keyword rows: Search keywords only. */
export function adGroupsFor(keywordRows, since, until) {
  const groups = new Map()
  for (const r of keywordRows || []) {
    const d = String(r.date || '')
    if (d < since || (until && d > until)) continue
    const key = String(r.ad_group_id || '')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  const out = []
  for (const [id, rows] of groups) {
    const newest = rows.reduce((a, b) => (String(b.date) > String(a.date) ? b : a), rows[0])
    const k = kpis(rows)
    out.push({
      id,
      name: newest.ad_group_name || '(unnamed ad group)',
      campaign: newest.campaign_name || '',
      keywords: new Set(rows.map((r) => r.criterion_id)).size,
      ...k,
    })
  }
  return out.sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name))
}

/** Keywords with the same verdicts as everywhere else, plus the rates. */
export function keywordsFor(keywordRows, since) {
  return diagnoseKeywords(keywordRows || [], { since }).map(withRates)
}

/**
 * Every search term, with what was spent on it and whether it should be
 * blocked. Status says whether somebody already decided (added as a keyword,
 * or excluded as a negative).
 */
export function termsFor(termRows, since, until) {
  const scoped = (termRows || []).filter((r) => {
    const d = String(r.date || '')
    return d >= since && (!until || d <= until)
  })
  const flags = new Map(negativeCandidates(scoped, { since }).map((t) => [t.term, t]))
  const groups = new Map()
  for (const r of scoped) {
    const term = String(r.search_term || '').toLowerCase()
    if (!groups.has(term)) groups.set(term, [])
    groups.get(term).push(r)
  }
  const out = []
  for (const [term, rows] of groups) {
    const k = kpis(rows)
    const statuses = rows.map((r) => String(r.status || '').toUpperCase())
    const status = statuses.some((s) => s.includes('EXCLUDED')) ? 'excluded' : statuses.some((s) => s.includes('ADDED')) ? 'added' : 'none'
    const flag = flags.get(term)
    out.push({
      term,
      keyword: rows[0].keyword_text || '',
      matchType: rows[0].match_type || '',
      campaign: rows[0].campaign_name || '',
      status,
      block: flag ? (flag.certain ? 'certain' : 'maybe') : '',
      why: flag?.why || '',
      ...k,
    })
  }
  return out.sort((a, b) => b.spend - a.spend || b.clicks - a.clicks || a.term.localeCompare(b.term))
}

// Shared with the Meta client page; re-exported so existing imports keep working.
export { MAX_PICKED, dateRange, sortRows, togglePick } from './clientReportKit.js'
