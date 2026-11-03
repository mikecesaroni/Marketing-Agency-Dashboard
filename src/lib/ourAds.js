/**
 * Our ads, not the client's own.
 *
 * When an ad account is connected to the CRM the sync pulls its history,
 * and that history can carry campaigns the client was already running
 * before they signed. Coelho Paiva's Google account came with a search
 * campaign that had been spending since October 6; the account was
 * connected on November 2, and the next morning's brief read "No leads in
 * 8 days of ads" ("we haven't had any live ads yet").
 *
 * The rule: a campaign that was spending before the day the account was
 * connected is the client's own. It is left out of the flags (no leads,
 * low leads), out of "live on Google", and out of the weekly status, for
 * as long as it runs. A campaign that first spends after the connection is
 * ours. The connection day is clients.meta_connected_at /
 * google_ads_connected_at (stamped by a trigger, supabase/accounts-connected.sql);
 * a client with no stamp (connected before the stamp existed) has no
 * legacy campaigns, everything counts. If we take over a client's own
 * campaign rather than building new ones, clear the stamp on the client
 * and everything counts again.
 *
 * The database view legacy_ad_campaigns lists { client_id, channel,
 * campaign_id } for every such campaign; this file drops their rows.
 * Pure, so scripts/check-our-ads.mjs runs it in Node.
 */

export const legacyKey = (clientId, channel, campaignId) => `${clientId}:${channel}:${campaignId}`

/** A Set of legacy keys from the view's rows (or an existing Set, returned as is). */
export function legacySet(rows) {
  if (rows instanceof Set) return rows
  return new Set((rows || []).map((r) => legacyKey(r.client_id, r.channel, r.campaign_id)))
}

/**
 * The ad-day rows that are ours: every row whose campaign is not a legacy
 * one for its client on this channel. Rows with no campaign id are kept;
 * nothing is known against them.
 */
export function withoutLegacy(rows, legacy, channel) {
  const set = legacySet(legacy)
  if (!set.size) return rows || []
  return (rows || []).filter((r) => !r?.campaign_id || !set.has(legacyKey(r.client_id, channel, String(r.campaign_id))))
}
