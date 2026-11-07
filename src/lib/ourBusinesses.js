/**
 * Our own businesses on the Reports page (Horizon HVAC, Horizon Water Co:
 * `is_internal`, never a client, never in a total). One row each, with the
 * Meta and the Google numbers for the window and whether Google Ads is
 * connected, so an account can be connected right there: there is no
 * client card to reach them from, and until 2026-11-07 ("make so I can
 * connect Google Ads accounts to the Horizon businesses") the row was Meta
 * only, built from the ad rows, so a business with nothing spent had no
 * row at all. Now the businesses themselves are the rows, and the numbers
 * hang off them.
 *
 * clients: the internal client rows (id, name, is_internal, archived,
 *          google_ads_customer_id, google_ads_sync_error)
 * metaRows: ad_daily rows with clients(is_internal) embedded
 * googleRows: google_campaign_daily rows, the same embed
 * windowStart: the first day of the range (rows before it are ignored)
 */
export function ourBusinessRows({ clients = [], metaRows = [], googleRows = [], windowStart = '' } = {}) {
  const by = new Map()
  const row = (id, name) => {
    if (!by.has(id)) by.set(id, { id, name: name || 'Unknown', metaSpend: 0, metaLeads: 0, googleSpend: 0, googleLeads: 0, googleId: '', googleError: '', client: null })
    return by.get(id)
  }
  for (const c of clients || []) {
    if (!c?.id || !c.is_internal || c.archived) continue
    const r = row(c.id, c.name)
    r.googleId = String(c.google_ads_customer_id || '').replace(/\D/g, '')
    r.googleError = String(c.google_ads_sync_error || '')
    r.client = c
  }
  const inWindow = (r) => !windowStart || String(r.date || '') >= windowStart
  for (const r of metaRows || []) {
    if (!r?.client_id || !r.clients?.is_internal || r.clients?.archived || !inWindow(r)) continue
    const x = row(r.client_id, r.clients?.name)
    x.metaSpend += Number(r.spend) || 0
    x.metaLeads += Number(r.leads) || 0
  }
  for (const r of googleRows || []) {
    if (!r?.client_id || !r.clients?.is_internal || r.clients?.archived || !inWindow(r)) continue
    const x = row(r.client_id, r.clients?.name)
    x.googleSpend += Number(r.cost) || 0
    x.googleLeads += Number(r.conversions) || 0
  }
  return [...by.values()]
    .map((r) => ({
      ...r,
      metaCpl: r.metaLeads > 0 ? r.metaSpend / r.metaLeads : 0,
      googleCpl: r.googleLeads > 0 ? r.googleSpend / r.googleLeads : 0,
      googleConnected: Boolean(r.googleId),
    }))
    .sort((a, b) => b.metaSpend + b.googleSpend - (a.metaSpend + a.googleSpend) || a.name.localeCompare(b.name))
}
