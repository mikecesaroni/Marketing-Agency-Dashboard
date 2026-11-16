// Who counts as a live client on the Clients tile, the Dashboard's Clients
// card and the Clients page subtitle ("20 live").
//
// 2026-11-16: "make so this is live clients who are not paused or archived".
// Before, the count was every client not archived, so a paused client still
// read as live. Pinned by scripts/check-live-clients.mjs.

/** Clients that are neither archived nor paused. */
export function liveClients(clients) {
  return (clients || []).filter((c) => c && !c.archived && !c.paused_at)
}
