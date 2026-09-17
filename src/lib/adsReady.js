// Who I can build ads for right now, with nothing in the way.
//
// The operating order is GoHighLevel first, then ads: the backend has to be
// standing -- A2P registered, the template in, the Meta lead form wired to it,
// the SMS follow-up built -- before a single ad is worth running, because an
// ad that generates a lead nothing answers is worse than no ad.
//
// That makes one question the most valuable thing the dashboard can answer:
// WHOSE BACKEND IS DONE AND WHOSE ADS ARE STILL OFF. Those clients are pure
// upside sitting still, and nothing else on the page says so -- "Meta not live
// yet" lumps them in with clients whose GHL has not been started, which is the
// opposite situation and needs the opposite action.
//
// Deliberately two groups, split by who is holding it up, the same way the GHL
// groups already are:
//
//   ready     backend done, Meta connected, ads off. The work is mine, today.
//   blocked   backend done, but Meta access or the Page is missing. The work is
//             a request to the client, and it is the thing standing between us
//             and spending their money well.
//
// A client on the GHL plan with no backend yet is in neither: they are not
// waiting on ads. A client NOT on the plan has no backend to wait for, so a
// connected Meta account with the ads off puts them straight in.

/** The four that make up "the GHL backend is built". */
export const GHL_BACKEND_KEYS = ['ghl-a2p', 'ghl-template', 'ghl-meta-form', 'ghl-sms']

const LABELS = {
  'ghl-a2p': 'A2P',
  'ghl-template': 'template',
  'ghl-meta-form': 'Meta form',
  'ghl-sms': 'SMS follow-up',
}

/**
 * How far along one client's GHL backend is.
 *
 * Two signals, because the CRM carries two and they can disagree. The four
 * deliverables are the substantive claim -- each names a thing that either
 * exists or does not. `ghl_active` is one flag somebody flips, and the
 * seeding rules say plainly that it is NOT the same claim as the automations
 * being built.
 *
 * Either satisfies this, and the caller is told which. Requiring both would
 * make the group empty for anyone who works by flipping the flag; requiring
 * only the flag would promise a backend nobody built.
 */
export function backendState(client, deliverables) {
  const mine = deliverables.filter((d) => d.client_id === client.id)
  const seeded = mine.filter((d) => GHL_BACKEND_KEYS.includes(d.template_key))
  const done = seeded.filter((d) => d.status === 'done')
  const open = seeded.filter((d) => d.status !== 'done')

  const allDone = seeded.length > 0 && open.length === 0
  const flagged = !!client.ghl_active

  return {
    // Nothing seeded and no flag means nothing to go on. Treated as not built:
    // claiming a backend is ready on the strength of no evidence is the one
    // failure mode that would cost real money.
    built: allDone || flagged,
    allDone,
    flagged,
    doneCount: done.length,
    total: seeded.length,
    openLabels: open.map((d) => LABELS[d.template_key] || d.template_key),
  }
}

/** Everything publishing needs beyond the ad account itself. */
function metaState(client) {
  const missing = []
  if (!client.meta_ad_account_id) missing.push('ad account')
  if (!client.meta_page_id) missing.push('Facebook Page')

  // Not blockers, because which one is needed depends on the campaign: an
  // instant form needs the privacy policy URL and no landing page, a traffic
  // campaign the reverse. Named rather than enforced, so the row can say what
  // will be asked for without holding the client out of the queue.
  const soft = []
  if (!client.website_url) soft.push('landing page URL')
  if (!client.privacy_policy_url) soft.push('privacy policy URL')

  return { connected: missing.length === 0, missing, soft }
}

/**
 * The two queues, from the dashboard's own client and deliverable lists.
 *
 * No extra fetch: both are already on the page.
 */
export function adsReady({ clients = [], deliverables = [] } = {}) {
  const ready = []
  const blocked = []

  for (const client of clients) {
    if (client.archived) continue
    // Already running. This is a queue of work to start, not a status board.
    if (client.meta_ads_active) continue

    // Not on GoHighLevel: there is no backend of ours to wait for, so a
    // connected Meta account with the ads off is the whole story. They used
    // to be skipped here, which hid exactly the client this queue is for.
    const onPlan = Boolean(client.ghl_plan)
    const backend = onPlan ? backendState(client, deliverables) : { built: true, allDone: false, flagged: false, doneCount: 0, total: 0, openLabels: [], none: true }
    if (!backend.built) continue

    const meta = metaState(client)
    const ghlWord = backend.none
      ? 'no GHL build'
      : backend.allDone
        ? 'GHL built'
        : `GHL marked live · ${backend.total - backend.doneCount} of ${backend.total} items still open`
    const row = {
      id: client.id,
      name: client.name,
      onPlan,
      backend,
      meta,
      // What the row should say, in the fewest words that are still true.
      note: meta.connected
        ? backend.none || backend.allDone
          ? meta.soft.length > 0
            ? `${ghlWord} · needs ${meta.soft.join(' and ')}`
            : `${ghlWord} · nothing in the way`
          : ghlWord
        : `waiting on their ${meta.missing.join(' and ')}`,
    }

    if (meta.connected) ready.push(row)
    else blocked.push(row)
  }

  const byName = (a, b) => a.name.localeCompare(b.name)
  return { ready: ready.sort(byName), blocked: blocked.sort(byName) }
}
