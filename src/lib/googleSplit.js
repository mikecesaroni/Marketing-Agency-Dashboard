// Google as one channel with two parts, Search and pay per lead, for the
// agency's Performance page. The pure half; scripts/check-google-split.mjs
// pins it.
//
// 2026-11-17: "we need to account for the pay per lead being merged over to
// Google Ads, I want to be able to see KPIs for LSA and Google Search ads,
// make it really intuitive on the KPIs tab, right now it's saying 0 for all
// data." Google moved Local Services into Google Ads as a Performance Max
// campaign with pay-per-lead goals, so the page shows one Google card with
// both parts side by side, and when pay per lead is empty it says who is set
// up, who is paused and who is still to connect rather than a row of zeros.

const clean = (v) => String(v ?? '').trim()

/**
 * Who runs pay per lead in the range, who is set up and quiet, and who is
 * still to connect.
 *
 *   clients       id, name, is_internal, archived, paused_at, lsa_active,
 *                 lsa_campaigns ([{id, name, status, type, account}] or null)
 *   campaignRows  the range's pay-per-lead campaign rows (client_id, cost,
 *                 clients(name))
 *   handRows      the range's hand-logged LSA weeks (client_id, ad_spend,
 *                 clients(name))
 *
 * running     names spending in the range (synced or logged by hand)
 * setUp       [{ name, paused }]: a pay-per-lead campaign on the account,
 *             nothing spent in the range; paused when every one is paused
 * toConnect   names marked LSA live with no campaign found, not paused as a
 *             client (a paused client is not chased)
 */
export function pplWho({ clients = [], campaignRows = [], handRows = [] } = {}) {
  const spendBy = new Map()
  const nameBy = new Map()
  for (const r of [...(campaignRows || []), ...(handRows || [])]) {
    if (!r?.client_id) continue
    const spend = Number(r.cost ?? r.ad_spend ?? 0) || 0
    spendBy.set(r.client_id, (spendBy.get(r.client_id) || 0) + spend)
    if (r.clients?.name) nameBy.set(r.client_id, r.clients.name)
  }
  const running = new Set()
  for (const [id, spend] of spendBy) if (spend > 0) running.add(id)

  const setUp = []
  const toConnect = []
  for (const c of clients || []) {
    if (!c?.id || c.is_internal || c.archived) continue
    nameBy.set(c.id, c.name)
    if (running.has(c.id)) continue
    const held = (Array.isArray(c.lsa_campaigns) ? c.lsa_campaigns : []).filter((x) => x && x.id)
    if (held.length) setUp.push({ name: clean(c.name), paused: held.every((x) => clean(x.status).toUpperCase() === 'PAUSED') })
    else if (c.lsa_active && !c.paused_at) toConnect.push(clean(c.name))
  }
  const byName = (a, b) => a.localeCompare(b)
  return {
    running: [...running].map((id) => clean(nameBy.get(id) || 'Unknown')).sort(byName),
    setUp: setUp.sort((a, b) => byName(a.name, b.name)),
    toConnect: toConnect.sort(byName),
  }
}

/**
 * Pay per lead per client for the range: spend from the campaign rows,
 * leads from the lead rows when the client has any (what Google reported,
 * one per call, message or booking), else the campaigns' conversions.
 * Returns Map client_id -> { spend, leads, name }.
 */
export function pplByClient({ campaignRows = [], leadRows = [] } = {}) {
  const out = new Map()
  const at = (id, name) => {
    if (!out.has(id)) out.set(id, { spend: 0, leads: 0, conversions: 0, leadRows: 0, name: name || 'Unknown' })
    const x = out.get(id)
    if (name && x.name === 'Unknown') x.name = name
    return x
  }
  for (const r of campaignRows || []) {
    if (!r?.client_id) continue
    const x = at(r.client_id, r.clients?.name)
    x.spend += Number(r.cost) || 0
    x.conversions += Number(r.conversions) || 0
  }
  for (const l of leadRows || []) {
    if (!l?.client_id) continue
    at(l.client_id, l.clients?.name).leadRows += 1
  }
  for (const x of out.values()) x.leads = x.leadRows > 0 ? x.leadRows : x.conversions
  return out
}
