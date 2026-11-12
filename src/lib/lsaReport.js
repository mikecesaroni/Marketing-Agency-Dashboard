// Local Services Ads, as rules: rows in, one page's numbers out.
//
// 2026-11-12: "go ahead and build the LSA KPI pull and do whatever you see
// as best for seeing LSA data and who's connected, who's not, etc, KPIs".
//
// Three tables feed it:
//
//   google_campaign_daily  -> spend, by day, for the Local Services campaigns
//                             (the standalone LOCAL_SERVICES type and the
//                             pay-per-lead Performance Max shape Google is
//                             moving LSA into). The nightly sync reads every
//                             campaign type in every connected account, so a
//                             client's LSA that lives in their Search account
//                             was here all along, counted as Google.
//   lsa_leads              -> the leads themselves (a call, a message, a
//                             booking), whether Google charged for each and
//                             whether it was credited back, and its status.
//                             Charged leads and cost per charged lead are the
//                             numbers LSA is judged on, since it bills per
//                             lead, not per click.
//   weekly_kpis (LSA)      -> the weeks logged by hand on a client page, for
//                             clients whose Local Services account is not
//                             connected yet. Never added to synced numbers
//                             for the same client.
//
// Everything is pure. No Supabase, no clock, so scripts/check-lsa-report.mjs
// can pin a window and assert.

import { inRange } from './googleSearchReport.js'

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100

/**
 * Which campaign rows are Local Services. The same test as the sync's
 * isLsaCampaign() and public.is_lsa_campaign() in the database.
 */
export function isLsaCampaign(type, name) {
  const t = String(type || '').toUpperCase()
  if (t === 'LOCAL_SERVICES') return true
  return t === 'PERFORMANCE_MAX' && /pay.?per.?lead|local services|\blsa\b/i.test(String(name || ''))
}

export function lsaRows(campaignRows) {
  return (campaignRows || []).filter((r) => isLsaCampaign(r.campaign_type, r.campaign_name))
}

export const LEAD_TYPES = { PHONE_CALL: 'Call', MESSAGE: 'Message', BOOKING: 'Booking' }
export const LEAD_STATUSES = {
  NEW: 'New',
  ACTIVE: 'Active',
  BOOKED: 'Booked',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
  DISABLED: 'Disabled',
  CONSUMER_DECLINED: 'Customer declined',
  WIPED_OUT: 'Removed',
}

const pretty = (v) => {
  const s = String(v || '').toUpperCase()
  return s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : ''
}
export const leadKind = (t) => LEAD_TYPES[String(t || '').toUpperCase()] || pretty(t) || 'Lead'
export const leadStatusLabel = (s) => LEAD_STATUSES[String(s || '').toUpperCase()] || pretty(s)
export const isCredited = (l) => String(l?.credit_state || '').toUpperCase() === 'CREDITED'
export const isBooked = (l) => String(l?.lead_status || '').toUpperCase() === 'BOOKED'

/** Lead rows with created_date in the window. */
export function leadsInRange(leads, since, until) {
  return (leads || []).filter((l) => {
    const d = String(l.created_date || '')
    return (!since || d >= since) && (!until || d <= until)
  })
}

/** The counts off lead rows: every lead, the charged ones, booked, credited, by kind. */
export function leadStats(leads) {
  const out = { leads: 0, charged: 0, booked: 0, credited: 0, calls: 0, messages: 0, bookings: 0 }
  for (const l of leads || []) {
    out.leads += 1
    if (l.lead_charged) out.charged += 1
    if (isBooked(l)) out.booked += 1
    if (isCredited(l)) out.credited += 1
    const t = String(l.lead_type || '').toUpperCase()
    if (t === 'PHONE_CALL') out.calls += 1
    else if (t === 'MESSAGE') out.messages += 1
    else if (t === 'BOOKING') out.bookings += 1
  }
  return out
}

/**
 * The KPIs for a set of Local Services campaign rows and the leads that go
 * with them. Leads are the lead rows when any were synced for these rows'
 * clients, else the campaigns' conversions (what Google reports as a lead
 * on the campaign); charged leads only ever come from the lead rows. Cost
 * per charged lead is the number that matters, and cost per lead is beside
 * it for accounts whose leads have not synced.
 */
export function lsaKpis(rows, leads) {
  let spend = 0
  let conversions = 0
  const days = new Set()
  for (const r of rows || []) {
    spend += Number(r.cost || 0)
    conversions += Number(r.conversions || 0)
    if (Number(r.cost || 0) > 0) days.add(String(r.date))
  }
  const s = leadStats(leads)
  const leadsN = leads?.length ? s.leads : Math.round(conversions)
  return {
    spend: r2(spend),
    days: days.size,
    leads: leadsN,
    fromLeadRows: Boolean(leads?.length),
    charged: s.charged,
    booked: s.booked,
    credited: s.credited,
    calls: s.calls,
    messages: s.messages,
    bookings: s.bookings,
    cpl: leadsN > 0 ? r2(spend / leadsN) : 0,
    cpcl: s.charged > 0 ? r2(spend / s.charged) : 0,
  }
}

/** Daily rows in the shape buildDailySeries wants: spend from the campaigns, leads from the lead rows when there are any. */
export function lsaDailyRows(rows, leads) {
  const by = new Map()
  const at = (date) => {
    const d = String(date)
    if (!by.has(d)) by.set(d, { date: d, spend: 0, leads: 0, clicks: 0, impressions: 0, conversions: 0 })
    return by.get(d)
  }
  for (const r of rows || []) {
    const x = at(r.date)
    x.spend += Number(r.cost || 0)
    x.conversions += Number(r.conversions || 0)
    x.clicks += Number(r.clicks || 0)
    x.impressions += Number(r.impressions || 0)
  }
  const useLeads = Boolean(leads?.length)
  for (const l of leads || []) at(l.created_date).leads += 1
  return [...by.values()].map((x) => ({ date: x.date, spend: x.spend, leads: useLeads ? x.leads : x.conversions, clicks: x.clicks, impressions: x.impressions }))
}

export const STATES = {
  live: { label: 'Live', tone: 'success', rank: 0 },
  // Spent in the range, then went quiet: paused in Google, or no spend for a
  // week. Horizon HVAC on 2026-11-12: both Local Services campaigns paused
  // since the 4th, which "Live" would have hidden behind the month's numbers.
  stopped: { label: 'Stopped', tone: 'warning', rank: 1 },
  connected: { label: 'Connected, quiet', tone: 'info', rank: 2 },
  'by-hand': { label: 'Logged by hand', tone: 'warning', rank: 3 },
  marked: { label: 'Marked live, not connected', tone: 'warning', rank: 4 },
  'not-connected': { label: 'Not connected', tone: 'neutral', rank: 5 },
  paused: { label: 'Paused', tone: 'neutral', rank: 6 },
}

/** No spend for this many days, with spend earlier in the range, reads as stopped. */
export const STOPPED_DAYS = 7

const dayDiff = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000)

/**
 * Why a client that spent in the range is not live now: 'paused' when the
 * newest synced row of every one of its Local Services campaigns says the
 * campaign is paused or removed (the sync rewrites the whole window each
 * run, so the status on the rows is the current one), 'quiet' when the last
 * day it spent is STOPPED_DAYS or more before today, else '' (still live).
 */
export function stoppedWhy(rows, lastDate, today) {
  const newest = new Map()
  for (const r of rows || []) {
    const id = String(r.campaign_id || r.campaign_name || '')
    const seen = newest.get(id)
    if (!seen || String(r.date) > String(seen.date)) newest.set(id, r)
  }
  const statuses = [...newest.values()].map((r) => String(r.campaign_status || '').toUpperCase())
  if (statuses.length && statuses.every((s) => s === 'PAUSED' || s === 'REMOVED')) return 'paused'
  if (lastDate && today && dayDiff(lastDate, today) >= STOPPED_DAYS) return 'quiet'
  return ''
}

/** The Monday on or before a 'YYYY-MM-DD'. */
function mondayOf(day) {
  const d = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(d)) return ''
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/**
 * One row per client, the whole story: who is live on Local Services, who is
 * connected and quiet, who is still logging weeks by hand, who ticked the
 * switch with nothing connected, and who is not connected at all.
 *
 *   clients       id, name, archived, is_internal, paused_at, tier, lsa_active,
 *                 lsa_customer_id, google_ads_customer_id, lsa_synced_at, lsa_sync_error
 *   campaignRows  google_campaign_daily rows, the loaded range (window and the
 *                 one before it); only the Local Services ones count here
 *   leads         lsa_leads rows, the loaded range
 *   handRows      weekly_kpis rows with channel 'LSA' (client_id, week_of, ad_spend, leads)
 *   since, until  the window
 *   today         'YYYY-MM-DD', for the stopped rule; until when not given
 */
export function lsaClientReport({ clients, campaignRows, leads, handRows, since, until, today }) {
  const now = today || until || ''
  const all = lsaRows(campaignRows)
  const allBy = new Map()
  for (const r of all) {
    if (!allBy.has(r.client_id)) allBy.set(r.client_id, [])
    allBy.get(r.client_id).push(r)
  }
  const nowBy = new Map()
  for (const r of inRange(all, since, until)) {
    if (!nowBy.has(r.client_id)) nowBy.set(r.client_id, [])
    nowBy.get(r.client_id).push(r)
  }
  const leadsBy = new Map()
  for (const l of leadsInRange(leads, since, until)) {
    if (!leadsBy.has(l.client_id)) leadsBy.set(l.client_id, [])
    leadsBy.get(l.client_id).push(l)
  }
  const monday = since ? mondayOf(since) : ''
  const handBy = new Map()
  for (const h of handRows || []) {
    if (monday && String(h.week_of) < monday) continue
    if (until && String(h.week_of) > until) continue
    const x = handBy.get(h.client_id) || { spend: 0, leads: 0, weeks: 0 }
    x.spend += Number(h.ad_spend || 0)
    x.leads += Number(h.leads || 0)
    x.weeks += 1
    handBy.set(h.client_id, x)
  }

  const out = []
  for (const c of clients || []) {
    if (c.archived || c.is_internal) continue
    const everRows = allBy.get(c.id) || []
    const rows = nowBy.get(c.id) || []
    const myLeads = leadsBy.get(c.id) || []
    const k = lsaKpis(rows, myLeads)
    const hand = handBy.get(c.id) || null
    const accounts = [...new Set(everRows.map((r) => r.customer_id).filter(Boolean))]
    const connected = everRows.length > 0 || Boolean(String(c.lsa_customer_id || '').replace(/\D/g, ''))
    let lastDate = ''
    for (const r of rows) if (Number(r.cost || 0) > 0 && String(r.date) > lastDate) lastDate = String(r.date)
    let lastLead = ''
    for (const l of myLeads) if (String(l.created_at_google || l.created_date) > lastLead) lastLead = String(l.created_at_google || l.created_date)
    const why = k.spend > 0 ? stoppedWhy(rows, lastDate, now) : ''
    const state = c.paused_at
      ? 'paused'
      : k.spend > 0
        ? why
          ? 'stopped'
          : 'live'
        : connected
          ? 'connected'
          : hand
            ? 'by-hand'
            : c.lsa_active
              ? 'marked'
              : 'not-connected'
    out.push({
      id: c.id,
      name: c.name,
      state,
      // For a stopped client: 'paused' (in Google) or 'quiet' (no spend for a week).
      stoppedWhy: state === 'stopped' ? why : '',
      quietDays: lastDate && now ? Math.max(0, dayDiff(lastDate, now)) : 0,
      tier: Number(c.tier) || 0,
      marked: Boolean(c.lsa_active),
      connected,
      account: String(c.lsa_customer_id || '').replace(/\D/g, '') || accounts[0] || '',
      // Where the Local Services campaign lives: its own account, or inside
      // the client's Search account (Horizon HVAC's), which reads "with Search".
      inSearchAccount: !String(c.lsa_customer_id || '').replace(/\D/g, '') && accounts.length > 0 && accounts[0] === String(c.google_ads_customer_id || '').replace(/\D/g, ''),
      ...k,
      hand,
      lastDate,
      lastLead,
      syncError: c.lsa_sync_error || '',
      synced: c.lsa_synced_at || null,
    })
  }
  return out.sort((a, b) => STATES[a.state].rank - STATES[b.state].rank || b.spend - a.spend || String(a.name).localeCompare(String(b.name)))
}

/** The counts for the connection line: how many in each state. */
export function lsaConnection(rows) {
  const n = (s) => (rows || []).filter((r) => r.state === s).length
  return { live: n('live'), stopped: n('stopped'), connected: n('connected'), byHand: n('by-hand'), marked: n('marked'), notConnected: n('not-connected'), paused: n('paused'), total: (rows || []).length }
}

/** The newest leads across every client, each naming its client. */
export function recentLeads(leads, clients, limit = 30) {
  const byName = new Map((clients || []).map((c) => [c.id, c.name]))
  const skip = new Set((clients || []).filter((c) => c.archived || c.is_internal).map((c) => c.id))
  return (leads || [])
    .filter((l) => !skip.has(l.client_id))
    .map((l) => ({
      id: l.lead_id,
      clientId: l.client_id,
      clientName: byName.get(l.client_id) || 'Unknown',
      kind: leadKind(l.lead_type),
      status: leadStatusLabel(l.lead_status),
      charged: Boolean(l.lead_charged),
      credited: isCredited(l),
      at: String(l.created_at_google || l.created_date || ''),
    }))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit)
}
