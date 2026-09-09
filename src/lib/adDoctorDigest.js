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
        prescription: v.prescription || '',
        spend: v.spend,
        leads: v.leads,
        cpl: v.cpl,
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
