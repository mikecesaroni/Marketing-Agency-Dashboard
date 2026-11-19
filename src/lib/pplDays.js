// Google pay per lead (Local Services) in the numbers the team reads every
// morning: the Client status board, the morning brief and the Monday status.
//
// 2026-11-19: "so is the CRM able to track leads from Google LSA / pay per
// lead? and include that in numbers from the morning brief". It is: the
// nightly Google sync writes every call, message and booking Google reports
// into lsa_leads. But the brief counted a Google campaign's `conversions` as
// its leads, pay-per-lead campaigns included, which is Google's attribution
// and not the leads themselves (checked that day on our own account: 49
// conversions against 46 lead records over 60 days). So for a pay-per-lead
// campaign the spend is the campaign's and the leads are the lead records,
// the way the Performance page and the pay-per-lead report already count
// them (lsaKpis), and the brief and the reports say the same number.
//
// Pure: scripts/check-ppl-days.mjs pins it.

import { isLsaCampaign } from './lsaReport.js'
import { legacyKey, legacySet } from './ourAds.js'

const day10 = (v) => String(v || '').slice(0, 10)

/**
 * The lead records that are ours to count. A client whose every pay-per-lead
 * campaign is one of their own from before we connected the account
 * (src/lib/ourAds.js) keeps its leads out of our numbers, as its spend is.
 *
 * leadRows    lsa_leads rows { client_id, created_date, lead_charged }
 * googleRows  google_campaign_daily rows, legacy campaigns still in
 * legacy      legacy_ad_campaigns rows, or the Set from legacySet()
 */
export function ourLeadRows(leadRows = [], googleRows = [], legacy = null) {
  const set = legacySet(legacy)
  if (!set.size) return leadRows || []
  const any = new Set()
  const ours = new Set()
  for (const r of googleRows || []) {
    if (!isLsaCampaign(r.campaign_type, r.campaign_name)) continue
    any.add(r.client_id)
    if (!r.campaign_id || !set.has(legacyKey(r.client_id, 'google', String(r.campaign_id)))) ours.add(r.client_id)
  }
  return (leadRows || []).filter((l) => !any.has(l.client_id) || ours.has(l.client_id))
}

/**
 * Google's campaign days and the pay-per-lead lead records as ad days:
 * [{ client_id, date, leads, spend, channel: 'google', ppl?, charged? }].
 *
 * A Search (or any other) campaign day carries its conversions as leads. A
 * pay-per-lead campaign day carries its spend, and its conversions only for
 * a client with no lead records at all in the rows given (an account whose
 * leads could not be read); otherwise each lead record is its own day row
 * with one lead, so nothing is counted twice.
 *
 * googleRows  rows already without legacy campaigns (withoutLegacy)
 * leadRows    rows already through ourLeadRows()
 */
export function googleAdDays(googleRows = [], leadRows = []) {
  const withLeads = new Set((leadRows || []).map((l) => l.client_id))
  const out = []
  for (const r of googleRows || []) {
    const ppl = isLsaCampaign(r.campaign_type, r.campaign_name)
    out.push({
      client_id: r.client_id,
      date: r.date,
      leads: ppl && withLeads.has(r.client_id) ? 0 : Number(r.conversions) || 0,
      spend: Number(r.cost) || 0,
      channel: 'google',
      ...(ppl ? { ppl: true } : {}),
    })
  }
  for (const l of leadRows || []) {
    if (!l?.client_id || !l.created_date) continue
    out.push({ client_id: l.client_id, date: day10(l.created_date), leads: 1, spend: 0, channel: 'google', ppl: true, lead: true, ...(l.lead_charged ? { charged: true } : {}) })
  }
  return out
}

/**
 * Pay per lead over the last seven days, per business, for the brief's own
 * section: [{ id, name, ours, leads, charged, spend, fromLeadRows }], only
 * the businesses with a lead or spend, clients first (most leads first),
 * then our own businesses.
 *
 * days     googleAdDays() rows (any window; only the last 7 days count)
 * clients  [{ id, name }] the clients in the brief
 * ours     [{ id, name }] our own businesses, never in a client number
 * today    'YYYY-MM-DD'
 */
export function payPerLeadWeek({ days = [], clients = [], ours = [], today } = {}) {
  const end = Date.parse(`${day10(today)}T00:00:00Z`)
  const by = new Map()
  for (const r of days || []) {
    if (!r?.ppl) continue
    const age = Math.round((end - Date.parse(`${day10(r.date)}T00:00:00Z`)) / 86400000)
    if (!Number.isFinite(age) || age < 0 || age > 6) continue
    if (!by.has(r.client_id)) by.set(r.client_id, { leads: 0, charged: 0, spend: 0, fromLeadRows: false })
    const x = by.get(r.client_id)
    x.leads += Number(r.leads) || 0
    x.spend += Number(r.spend) || 0
    if (r.lead) x.fromLeadRows = true
    if (r.charged) x.charged += 1
  }
  const row = (c, isOurs) => {
    const x = by.get(c.id)
    if (!x || !(x.leads > 0 || x.spend > 0)) return null
    return { id: c.id, name: String(c.name || '').trim(), ours: isOurs, leads: Math.round(x.leads), charged: x.charged, spend: Math.round(x.spend * 100) / 100, fromLeadRows: x.fromLeadRows }
  }
  const order = (a, b) => b.leads - a.leads || b.spend - a.spend || a.name.localeCompare(b.name)
  return [...(clients || []).map((c) => row(c, false)).filter(Boolean).sort(order), ...(ours || []).map((c) => row(c, true)).filter(Boolean).sort(order)]
}
