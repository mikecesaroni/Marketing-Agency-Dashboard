// The Client tiers page (src/pages/ClientStatusPage.jsx): the three plans
// side by side with the names under each, and what a click on a name shows.
//
// Pure, on the rows the board already loads (statusRows.js): the client,
// the pipeline result and the flags. scripts/check-channel-status.mjs runs
// it in Node.

import { everyChannel } from './channelStatus.js'

/** Rows per plan (0 is no plan set): running clients A to Z, then the paused ones. */
export function tierColumns(rows = []) {
  const by = { 1: [], 2: [], 3: [], 0: [] }
  for (const r of rows) (by[r.tier] || by[0]).push(r)
  const name = (r) => String(r.client?.name || '')
  for (const k of Object.keys(by)) by[k].sort((a, b) => Boolean(a.client?.paused_at) - Boolean(b.client?.paused_at) || name(a).localeCompare(name(b)))
  return by
}

/** What each state is called on the page. */
export const STATE_WORDS = { live: 'Live', connected: 'Not live yet', refused: 'No access', missing: 'Not connected', stopped: 'Stopped', paused: 'Paused' }

/**
 * Meta and Google for one row, as the page says them. The connection and
 * the live switch come from channelStatus.js. On top of that a paused
 * client reads paused, and Meta marked live while the delivery alert says
 * nothing is spending reads stopped, so "Live" always means ads are running.
 * Each entry: { key, label, state, detail, inPackage }.
 */
export function liveChannels(row) {
  const client = row?.client || {}
  const stopped = (row?.flags || []).find((f) => f.key === 'ads-off' || f.key === 'account')
  return everyChannel(client, { googleCampaigns: row?.result?.live?.google ? 1 : 0 }).map((ch) => {
    if (client.paused_at && ch.state !== 'missing') return { ...ch, state: 'paused', detail: 'Client is on pause' }
    if (ch.key === 'meta' && ch.state === 'live' && stopped) return { ...ch, state: 'stopped', detail: stopped.label || 'Meta ads stopped' }
    return ch
  })
}
