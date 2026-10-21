// The Client status board: what each client is owed for their package, how
// far along it is, and what needs a call today.
//
// Pure. Everything comes in as rows the CRM already keeps: the launch
// pipeline (nextSteps), the video board's row for the client (videoDrops),
// the last two weeks of ad days, the delivery alert, the payments. This
// turns them into one list of FLAGS per client, worst first, and says
// whether any of them means somebody should contact the client.
//
// A flag is { key, severity, label, detail, href }:
//   red     something is broken or owed: ads off, no leads while spending,
//           no new ad in ten days, a payment overdue
//   amber   waiting on the client for a week or more, a sync failing
//   blue    housekeeping for us: a clip waiting, KPIs not logged, the tier
//           not confirmed
//
// scripts/check-client-status.mjs runs it in Node.

import { tierOf } from './clientTiers.js'

// The video promise: a new ad every ten days (STALE_DAYS in videoLaunch.js,
// repeated here so this file stays free of browser imports).
const STALE_DAYS = 10

export const SEVERITY_ORDER = { red: 0, amber: 1, blue: 2 }

/** Days from an ISO date (or date-time) to today's 'YYYY-MM-DD'; null when either is missing. */
function daysSince(when, today) {
  if (!when || !today) return null
  const a = new Date(String(when).slice(0, 10) + 'T00:00:00Z')
  const b = new Date(today + 'T00:00:00Z')
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.max(0, Math.round((b - a) / 86400000))
}

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`

/**
 * Leads and spend from the ad days: { leads7, leads14, spend7, spend14, lastLeadDate }.
 * rows: [{ date, leads, spend }] for one client, any order, Meta and Google
 * together (Google's conversions count as leads).
 */
export function leadTotals(rows = [], today) {
  const out = { leads7: 0, leads14: 0, spend7: 0, spend14: 0, lastLeadDate: '' }
  for (const r of rows) {
    const age = daysSince(r.date, today)
    if (age === null || age > 13) continue
    const leads = Number(r.leads) || 0
    const spend = Number(r.spend) || 0
    out.leads14 += leads
    out.spend14 += spend
    if (age <= 6) {
      out.leads7 += leads
      out.spend7 += spend
    }
    if (leads > 0 && r.date > out.lastLeadDate) out.lastLeadDate = r.date
  }
  return out
}

/**
 * ctx:
 *   client    the clients row
 *   result    nextSteps() for the client
 *   drop      the videoDrops() row for the client, or null
 *   leads     leadTotals() for the client
 *   alert     the adDeliveryAlerts() entry for the client, or null
 *   payments  payments rows for the client [{ payment_type, status, due_date, amount, failure_count }]
 *   today     'YYYY-MM-DD'
 */
export function clientFlags(ctx) {
  const c = ctx.client || {}
  const result = ctx.result || { steps: [], ours: [], theirs: [], launched: false }
  const drop = ctx.drop || null
  const leads = ctx.leads || leadTotals([], ctx.today)
  const today = ctx.today || new Date().toISOString().slice(0, 10)
  const { tier, guessed } = tierOf(c)
  const live = Boolean(c.meta_ads_active) && !c.paused_at
  const flags = []
  const add = (f) => flags.push(f)

  // Nothing is expected of a paused client, and the pause itself is the only
  // news: no ads, no leads, no chase, and no money flag either. A paused
  // subscription's invoices fail by design ("MBD is a paused client; it is
  // normal for their card to fail"), so a card failing on a paused client is
  // not a call, and the Slack channel never hears about it.
  if (c.paused_at) {
    add({ key: 'paused', severity: 'blue', label: 'On pause', detail: `Since ${String(c.paused_at).slice(0, 10)}. No ads expected until they are resumed.`, href: `/client/${c.id}` })
    return flags
  }

  if (ctx.alert) {
    const a = ctx.alert
    add({
      key: a.kind === 'account' ? 'account' : 'ads-off',
      severity: 'red',
      label: a.kind === 'account' ? a.headline : `Meta ads stopped${a.quietDays ? `: ${a.quietDays} days without spend` : ''}`,
      detail: a.detail || 'Nothing has spent lately. Check Ads Manager.',
      href: `/client/${c.id}#meta`,
    })
  }

  // Spending with nothing to show for it. Seven quiet days on a running
  // account is a call, not a wait.
  if (live && !ctx.alert && leads.spend14 > 0) {
    const since = leads.lastLeadDate ? daysSince(leads.lastLeadDate, today) : null
    if (leads.leads14 === 0 || (since !== null && since >= 7)) {
      add({
        key: 'no-leads',
        severity: 'red',
        label: since === null ? 'No leads in 14 days' : `No leads for ${since} days`,
        detail: `${money(leads.spend14)} spent in the last two weeks for ${leads.leads14} lead${leads.leads14 === 1 ? '' : 's'}. Look at the ads, the offer and the form before they ask.`,
        href: `/client/${c.id}#ad-performance`,
      })
    }
  }

  // The video promise: a new ad every ten days (src/lib/videoLaunch.js).
  // Only once their Meta ads are live: a client added this afternoon with an
  // ad account and no ad on record is not behind, they are onboarding, and
  // "No ad has gone out yet" in the Slack channel was a false alarm.
  if (drop && live && drop.hasMeta && (drop.state === 'stale' || drop.state === 'never' || (drop.state === 'ready' && drop.behind))) {
    add({
      key: 'video-stale',
      severity: 'red',
      label: drop.lastAdAt ? `No new video or ad in ${drop.daysSince} days` : 'No ad has gone out yet',
      detail: drop.lastAdAt ? `Last one ${String(drop.lastAdAt).slice(0, 10)}${drop.lastAdName ? ` (${drop.lastAdName})` : ''}. The promise is one every ${STALE_DAYS} days.` : 'A Meta account and nothing published to it.',
      href: '/content',
    })
  }
  if (drop && drop.state === 'ready' && drop.waiting?.length) {
    add({
      key: 'clip-waiting',
      severity: 'blue',
      label: `${drop.waiting.length} new clip${drop.waiting.length === 1 ? '' : 's'} waiting to go out`,
      detail: 'Edited and dropped in, not published yet.',
      href: '/content',
    })
  }

  // Money: an unpaid invoice past its date, or a card that keeps failing.
  const owed = (ctx.payments || []).filter((p) => p.status !== 'paid' && ((p.due_date && p.due_date < today) || p.status === 'overdue' || Number(p.failure_count) > 0))
  if (owed.length) {
    const total = owed.reduce((n, p) => n + (Number(p.amount) || 0), 0)
    const failing = owed.some((p) => Number(p.failure_count) > 0)
    add({
      key: 'payment',
      severity: 'red',
      label: failing ? 'Card failing' : `Payment overdue: ${money(total)}`,
      detail: owed.map((p) => `${p.payment_type === 'setup' ? 'Setup' : 'Monthly'} ${money(p.amount)}${p.due_date ? ` due ${p.due_date}` : ''}`).join(' · '),
      href: '/payments',
    })
  }

  // Waiting on them for a week or more: the chase is overdue.
  const stale = (result.theirs || []).filter((s) => (s.waitingDays || 0) >= 7)
  if (stale.length) {
    const longest = stale.reduce((m, s) => (s.waitingDays > m.waitingDays ? s : m), stale[0])
    add({
      key: 'waiting',
      severity: 'amber',
      label: `Waiting on them ${longest.waitingDays} days`,
      detail: stale.map((s) => s.title).join(' · '),
      href: `/client/${c.id}`,
    })
  }

  if (tier >= 2 && c.google_ads_customer_id && c.google_ads_sync_error) {
    add({ key: 'google-sync', severity: 'amber', label: 'Google Ads sync failing', detail: String(c.google_ads_sync_error).slice(0, 140), href: `/client/${c.id}#google-search` })
  }

  if (live && Number(ctx.counts?.kpisThisWeek || 0) === 0) {
    add({ key: 'kpis', severity: 'blue', label: 'KPIs not logged this week', detail: 'Meta syncs itself; LSA and the rest are logged by hand.', href: `/client/${c.id}?open=kpis` })
  }

  if (!tier) {
    add({ key: 'tier', severity: 'blue', label: 'No package set', detail: 'Pick their tier on this card so the checklist knows what they are owed.', href: `/client/${c.id}` })
  } else if (guessed) {
    add({ key: 'tier', severity: 'blue', label: 'Package guessed from the fee', detail: 'Confirm the tier on this card.', href: `/client/${c.id}` })
  }

  flags.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  return flags
}

/** One client's row on the board. */
export function clientStatus(ctx) {
  const flags = clientFlags(ctx)
  const { tier, guessed } = tierOf(ctx.client)
  const red = flags.filter((f) => f.severity === 'red').length
  const amber = flags.filter((f) => f.severity === 'amber').length
  return {
    client: ctx.client,
    intake: ctx.intake || null,
    result: ctx.result,
    drop: ctx.drop || null,
    leads: ctx.leads || leadTotals([], ctx.today),
    tier,
    guessed,
    flags,
    red,
    amber,
    // A call today: something is broken, owed, or waited on too long.
    needsContact: red + amber > 0,
  }
}

/** Worst first: red flags, then amber, then the most of our steps open, then the name. */
export function statusOrder(a, b) {
  return b.red - a.red || b.amber - a.amber || (b.result?.ours?.length || 0) - (a.result?.ours?.length || 0) || String(a.client?.name || '').localeCompare(String(b.client?.name || ''))
}

/** The buckets: one per package, and one for clients with no package yet. */
export function bucketRows(rows) {
  const by = { 1: [], 2: [], 3: [], 0: [] }
  for (const r of rows) (by[r.tier] || by[0]).push(r)
  for (const k of Object.keys(by)) by[k].sort(statusOrder)
  return by
}
