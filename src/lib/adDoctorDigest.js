import { diagnoseAds } from './adDoctorRules.js'

// The dashboard's view of the Ad Doctor Agent: every client's rows run through
// the same rules the client page uses, boiled down to the two verdicts that
// need a hand on the account today. Kill means money is going out for
// nothing; scale means a winner is sitting on a budget it has outgrown. Watch,
// learning and healthy stay on the client page, where the arithmetic is.
//
// Pure: takes rows, returns items. The rules are diagnoseAds, unchanged, so a
// verdict here is the same verdict the client page shows.

export const DIGEST_VERDICTS = ['kill', 'scale']

/**
 * rows: ad_daily rows for the last 30 days across every client, each with
 * `client_id` and a `clients` embed ({name, is_internal}). learnings: every
 * ad_learnings row (account scope and per-client), optional, used only to
 * quote the agency's numbers in prescriptions. today: for tests.
 */
export function digestAdDoctor(rows, { learnings = [], today } = {}) {
  const byClient = new Map()
  for (const r of rows || []) {
    if (!r.client_id) continue
    const c = r.clients || {}
    if (c.is_internal) continue
    const g = byClient.get(r.client_id) || { clientId: r.client_id, clientName: c.name || 'Client', rows: [] }
    g.rows.push(r)
    byClient.set(r.client_id, g)
  }

  const items = []
  for (const g of byClient.values()) {
    const mine = learnings.filter((l) => l.scope === 'account' || l.client_id === g.clientId)
    const result = diagnoseAds(g.rows, { learnings: mine, today })
    for (const v of result.verdicts) {
      if (!DIGEST_VERDICTS.includes(v.verdict)) continue
      items.push({
        clientId: g.clientId,
        clientName: g.clientName,
        adId: v.adId,
        name: v.name,
        campaign: v.campaign,
        verdict: v.verdict,
        reason: v.reasons[0] || '',
        // Everything the client page shows, so "why?" can be answered here
        // without a round trip: every reason, the retention signals, the
        // attribution and the numbers the rules used.
        reasons: v.reasons || [],
        signals: v.signals || [],
        prescription: v.prescription || '',
        cause: v.cause || null,
        isVideo: Boolean(v.isVideo),
        days: v.days,
        spend: v.spend,
        leads: v.leads,
        cpl: v.cpl,
        ctr: v.ctr,
        cpm: v.cpm,
        frequency: v.frequency,
        ctrDecay: v.ctrDecay,
        cpmChange: v.cpmChange,
        holdRate: v.holdRate,
        hookRate: v.hookRate,
        medianCpl: result.medianCpl,
        usingFallback: result.usingFallback,
      })
    }
  }

  // Kills first, then scales; inside each, biggest spend first, because that
  // is the one costing (or earning) the most while nobody looks.
  const order = { kill: 0, scale: 1 }
  items.sort((a, b) => order[a.verdict] - order[b.verdict] || b.spend - a.spend || a.clientName.localeCompare(b.clientName))
  return items
}

/** Counts by verdict, for the card heading. */
export function digestCounts(items) {
  const counts = { kill: 0, scale: 0, clients: 0 }
  const clients = new Set()
  for (const it of items) {
    counts[it.verdict] = (counts[it.verdict] || 0) + 1
    clients.add(it.clientId)
  }
  counts.clients = clients.size
  return counts
}

/** "2 ads to kill, 1 to scale" / "1 ad to kill" / "3 ads to scale". */
export function digestHeadline(items) {
  const { kill, scale } = digestCounts(items)
  const parts = []
  if (kill) parts.push(`${kill} ad${kill === 1 ? '' : 's'} to kill`)
  if (scale) parts.push(kill ? `${scale} to scale` : `${scale} ad${scale === 1 ? '' : 's'} to scale`)
  return parts.join(', ')
}

/** One line of the numbers behind a verdict, for the card row. */
export function digestNumbers(item) {
  const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`
  const lead = item.leads === 1 ? 'lead' : 'leads'
  const cpl = item.cpl != null ? `${money(item.cpl)}/lead` : 'no leads'
  return `${money(item.spend)} spent, ${item.leads} ${lead}, ${cpl} · account median ${money(item.medianCpl)}${item.usingFallback ? ' (fallback)' : ''}`
}

/**
 * The numbers behind a verdict as label/value pairs, in the order a person
 * checks them: what it cost, how it is being received, how that is moving.
 * Nulls (an image ad has no hold rate; a young ad has no trend) are left out
 * rather than printed as n/a.
 */
export function digestDetails(item) {
  const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`
  const rows = []
  rows.push(['Spent', `${money(item.spend)} over ${item.days} day${item.days === 1 ? '' : 's'}`])
  rows.push(['Leads', `${item.leads} · ${item.cpl != null ? `${money(item.cpl)} per lead` : 'no leads yet'} · account median ${money(item.medianCpl)}${item.usingFallback ? ' (industry fallback)' : ''}`])
  if (item.ctr != null) rows.push(['Click rate', `${(item.ctr * 100).toFixed(2)}%${item.ctrDecay != null ? ` · ${item.ctrDecay >= 0 ? 'down' : 'up'} ${Math.abs(Math.round(item.ctrDecay * 100))}% vs its first week` : ''}`])
  if (item.cpm != null) rows.push(['CPM', `$${item.cpm.toFixed(1)}${item.cpmChange != null ? ` · ${item.cpmChange >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(item.cpmChange * 100))}% week over week` : ''}`])
  if (item.frequency != null) rows.push(['Frequency', `${item.frequency.toFixed(1)} views per person (daily proxy, true figure is higher)`])
  if (item.holdRate != null) rows.push(['Video hold', `${item.holdRate.toFixed(0)}% of plays reach ThruPlay`])
  if (item.hookRate != null) rows.push(['Hook rate', `${item.hookRate.toFixed(0)}% watch past two seconds`])
  if (item.cause) rows.push(['Cause', item.cause === 'market' ? 'the auction got dearer, not the ad' : item.cause === 'both' ? 'the creative is tiring and the auction got dearer' : 'the creative is tiring'])
  return rows
}
