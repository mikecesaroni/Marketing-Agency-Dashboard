// The team brief: what needs attention this morning, what is new since
// the last look, and what is running clean. One model, three renderings
// (Slack, email, plain text), and the alert keys the Slack channel is kept
// in step with.
//
// Pure. The team-digest Edge Function feeds it the same Client status rows
// the board shows (src/lib/statusRows.js) and, on a Monday, the weekly
// status (src/lib/weeklyStatus.js); the CRM shows the same brief as a
// preview. scripts/check-team-brief.mjs runs it in Node.
//
// THE QUIET RULES. "We don't want to be bombarded." So:
//   * The BRIEF is one message a morning, weekends too. One line per thing, no
//     explanations: the flag names the problem, the link goes to the fix.
//     The clients running clean are one line with their leads for the week,
//     so the good news is there without a paragraph each.
//   * An ALERT goes out the moment it appears only when waiting for the
//     morning costs money or a day: an ad account disabled, ads gone quiet,
//     a new edit dropped in (so it gets published today), a client crossing
//     ten days without an ad. Once per client per episode, never repeated,
//     and one line when ads are delivering again. Everything else (no leads
//     while spending, a payment, a chase a week old, housekeeping) waits
//     for the brief.
//   * No alert outside 7am to 9pm Eastern; the morning brief covers the
//     night. The brief marks everything it carried as posted, so the first
//     alert run of the day does not say it all again.

import { TIER_BY_NUMBER } from './clientTiers.js'
import { daysBetween, longDay, shortDay } from './dates.js'
import { dashedId } from './googleAdsId.js'
import { clipMetaWords } from './videoLaunch.js'
import { money, weeklyLine } from './weeklyStatus.js'

/**
 * A dropped clip's line: the file, who dropped it, where it is with Meta,
 * the editor's note. "in Meta, ready to publish" is where the sweep
 * (supabase/functions/video-sweep/index.ts) brings every clip on its own; a
 * row from before the state existed carries only `ready`.
 */
function clipLabel(w, hasMeta = true) {
  const meta = w.meta || (w.ready ? 'ready' : 'none')
  return `${w.name}${w.by ? ` from ${w.by}` : ''} · ${clipMetaWords(meta, hasMeta)}${w.note ? ` · “${w.note}”` : ''}`
}

/**
 * A dropped static's line (2026-11-12, "send CRM message when new statics
 * are dropped"): the ad's name, how many sizes, who dropped it, whether
 * there is an account to publish into, the editor's note. Nothing to wait
 * for: an image needs no transcode, so it is ready the moment it lands.
 */
function staticLabel(s, hasMeta = true) {
  const n = Array.isArray(s.files) ? s.files.length : 0
  return `${s.name}${n > 1 ? ` (${n} sizes)` : ''}${s.by ? ` from ${s.by}` : ''} · ${hasMeta ? 'ready to publish' : 'no Meta account to send it to'}${s.note ? ` · “${s.note}”` : ''}`
}

/**
 * How long a dropped clip is given to reach Meta before the channel hears
 * of it. The sweep sends it and marks it ready inside this, so the one
 * line posted (an alert is never repeated) can say "ready to publish"
 * rather than "not in Meta yet" for ever. A clip Meta refused, or one with
 * no account to go to, posts at once.
 */
export const CLIP_HOLD_MS = 10 * 60000

/**
 * The flags that get their own post the moment they appear. Clips are keyed
 * separately (one per drop). `payment` counts only when it is a card
 * failing: "just tell us when a card fails, and don't keep showing it", so
 * it is said once, when it happens, and never again in a brief. An overdue
 * invoice is the Payments page's business and goes nowhere in Slack.
 */
export const IMMEDIATE = new Set(['account', 'ads-off', 'video-stale', 'payment'])
const isImmediate = (f) => (f.key === 'payment' ? f.label === 'Card failing' : IMMEDIATE.has(f.key))
/**
 * The ad flags: the brief's attention list, and what "running clean" is the
 * absence of. A chase (waiting on the client) is not a flag in the brief at
 * all but a day count on the onboarding line. The first real brief had
 * twelve "waiting on them" lines for clients whose ads were running fine,
 * and nobody reads a list like that twice.
 */
// 'low-leads' (two leads or fewer on a full week of spend) is in: a client
// spending all week for one lead is not "running clean", and the brief is
// where that gets seen ("that is where we identify delivering value").
export const AD_FLAGS = new Set(['account', 'ads-off', 'no-leads', 'low-leads', 'video-stale', 'google-sync'])
/** The ones worth a line when they clear: the ads are back. */
export const CLEAR_WORTHY = new Set(['account', 'ads-off'])

const EMOJI = {
  account: '🚨',
  'ads-off': '🔴',
  'no-leads': '🟠',
  'video-stale': '📹',
  payment: '💳',
  waiting: '⏳',
  'google-sync': '🟠',
  clip: '🎬',
  static: '🖼️',
  green: '🟢',
  onboarding: '⚪',
  paused: '⏸️',
  cleared: '✅',
}

const pick = (c) => ({ id: c.id, name: c.name })
const active = (r) => r?.client && !r.client.archived && !r.client.is_internal

// The step each channel goes live on, for the "Meta and Google live" tail.
const LIVE_STEPS = [
  ['go-live', 'Meta'],
  ['google-publish', 'Google'],
  ['lsa-live', 'LSA'],
]
// A client is in setup until the AD channels the package owes are live,
// launched or not: Meta, and Google on the Whole Chain and up. Local
// Services is not a gate ("Dynamic Flow is already onboarded" when the
// line still read "get Local Services live" on day 60): it stays a step on
// the Client tiers board, and the move on a launched client, but a client
// live on Meta and Google is onboarded.
const GATE_KEYS = new Set(['go-live', 'google-publish'])
// The chain each channel runs through, for the next move on a launched client.
const CHANNEL_KEYS = ['meta-access', 'creatives', 'publish', 'go-live', 'google-ads-access', 'google-publish', 'lsa-live']
const OWNER_CLIENT = 'client'

// ---------------------------------------------------------------------------
// onboarding: one plain-words move per client
//
// "We want to know what we need to do, and if everything is connected then
// we need to get videos made or publish them." So the onboarding line is
// the move, said the way somebody would say it at the desk, then only the
// gaps (what is still missing, not a strip of ticks), then what is live.
// The steps are the pipeline's (nextSteps.js), so the line follows the
// package: Maintenance is one channel, Meta and Google is both.
// ---------------------------------------------------------------------------

/** What WE do next, by step. */
const OUR_MOVE = {
  'onboarding-form': 'send the onboarding form',
  'onboarding-call': 'do the onboarding call',
  'ghl-build': 'build the GHL backend',
  'ghl-live': 'mark GHL live',
  creatives: 'build the ads',
  'past-customers': 'load the past customer list',
  'ai-brain': 'build the second-brain AI',
  automations: 'build the automations',
  publish: 'publish to Meta',
  'go-live': 'switch the Meta ads on and mark live',
  'google-publish': 'build and publish the Google campaign',
  'lsa-live': 'get Local Services live',
  'weekly-kpis': 'log this week’s KPIs',
}
/** What we are waiting on THEM for, by step. */
const THEIR_MOVE = {
  'setup-fee': 'the setup fee',
  'onboarding-form': 'the onboarding form',
  'meta-access': 'Meta ad account and Page access',
  'google-ads-access': 'Google Ads access',
  'ghl-form': 'their GHL account details',
  photos: 'their photos and videos',
}
/** The connections a client is still missing, by step, in the order they are asked for. */
const GAP_STEPS = [
  ['onboarding-form', 'the form'],
  ['meta-access', 'Meta account'],
  ['google-ads-access', 'Google account'],
  ['ghl-form', 'GHL details'],
]
// The accounts that make a client "connected": the form, the ad accounts
// the package needs, and the Drive folder for their photos. GHL details
// are a chase too, but not what "connected" means at the desk.
const CONNECTED_KEYS = new Set(['onboarding-form', 'meta-access', 'google-ads-access'])

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The next move on a client's setup. Not launched: the pipeline's own next
 * (ours first, else the chase). Launched with a channel still to come: the
 * first open step on that channel's chain, so a Whole Chain client live on
 * Meta reads "Google Ads access", not the past customer list.
 */
export function setupNext(result) {
  if (!result?.launched) return result?.next || null
  const open = (result.steps || []).filter((s) => !s.done && !s.blocked && CHANNEL_KEYS.includes(s.key))
  return open.find((s) => s.owner !== OWNER_CLIENT) || open[0] || result.next || null
}

/**
 * Where the client's videos are, once Meta is owed and the ad account is
 * in: the thing to do after everything is connected is to get videos made,
 * or to publish the ones that are in. From the video board's row
 * (videoLaunch.js): clips registered in the CRM, clips dropped in and not
 * published, video ads out. '' when Meta is not in the picture.
 */
function videoStage(by, drop) {
  const goLive = by.get('go-live')
  const meta = by.get('meta-access')
  if (!goLive || goLive.done || !meta?.done || !drop) return ''
  const waiting = drop.waiting?.length || 0
  if (waiting) return `${plural(waiting, 'clip')} waiting to publish`
  const clips = Number(drop.clips) || 0
  if (!clips) return 'no videos yet: get them made'
  if (!(Number(drop.total) > 0)) return `${plural(clips, 'video')} in, none published yet`
  return `${plural(drop.total, 'video ad')} out`
}

/**
 * The onboarding line for one client, from the pipeline steps, the client
 * row and the video board's row:
 *
 *   move      what to do, in plain words ("build the ads"), or what we are
 *             waiting on them for ("Google Ads access, 58 days")
 *   theirs    true when the move is the client's
 *   days      how long they have had it
 *   gaps      the connections still missing ("the form (5 days)", "Drive folder")
 *   connected the form, the accounts the package needs and the Drive folder are all in
 *   live      "Meta and Google live", or ''
 *   videos    where the videos are, once connected on Meta, or ''
 *   text      the line: move · connected / still need: ... · live · videos
 */
export function setupLine(result, client = null, drop = null) {
  const steps = Array.isArray(result?.steps) ? result.steps : []
  const by = new Map(steps.map((s) => [s.key, s]))
  const next = setupNext(result)
  // Finished edits sitting there are the loudest thing on a setup, as on
  // the video board: when clips are waiting and nothing blocks the publish,
  // publishing them is the move, whatever else is open.
  const waitingClips = drop?.waiting?.length || 0
  const publish = by.get('publish')
  const publishNow = waitingClips > 0 && publish && !publish.done && !publish.blocked
  const theirs = !publishNow && next?.owner === OWNER_CLIENT
  const days = theirs ? Number(next?.waitingDays) || 0 : 0
  const wait = (s) => (Number(s?.waitingDays) >= 7 ? ` (${s.waitingDays} days)` : '')

  const gaps = []
  let connected = steps.length > 0
  for (const [key, name] of GAP_STEPS) {
    const s = by.get(key)
    if (!s || s.done) continue
    if (CONNECTED_KEYS.has(key)) connected = false
    // The move itself is not repeated as a gap.
    if (next?.key === key) continue
    gaps.push(key === 'onboarding-form' && s.owner !== OWNER_CLIENT ? 'the form (not sent)' : `${name}${wait(s)}`)
  }
  // A row with no steps (an old row, a test) says nothing about the folder.
  if (steps.length && client && !client.drive_folder_id) {
    connected = false
    gaps.push('Drive folder')
  }

  const liveNames = LIVE_STEPS.filter(([k]) => by.get(k)?.done).map(([, name]) => name)
  const live = liveNames.length ? `${liveNames.join(' and ')} live` : ''

  // The videos are the line's tail once everything is connected; before
  // that the gaps are the news, and the line stays short.
  const stage = videoStage(by, drop)
  let videos = connected ? stage : ''
  let move
  if (publishNow) {
    move = `publish the ${plural(waitingClips, 'clip')} waiting`
    videos = ''
  } else if (!next) move = 'nothing open'
  else if (theirs) move = `${THEIR_MOVE[next.key] || next.title}${days >= 7 ? `, ${days} days` : ''}`
  else if (next.key === 'creatives' && stage.startsWith('no videos')) {
    move = 'get videos made (send the script link), then build the ads'
    videos = ''
  } else move = OUR_MOVE[next.key] || next.title

  const text = [move, connected ? 'connected' : '', gaps.length ? `still need: ${gaps.join(', ')}` : '', live, videos].filter(Boolean).join(' · ')
  return { move, theirs, days, gaps, connected, live, videos, text }
}

/**
 * The morning brief.
 *
 *   statusRows  clientStatus() rows
 *   weekly      buildWeeklyStatus() report, or null on any day but Monday
 *   day         'YYYY-MM-DD'
 */
export function buildBrief({ statusRows = [], weekly = null, day, appUrl = '' }) {
  const rows = statusRows.filter(active)
  const attention = []
  const clips = []
  const green = []
  const onboarding = []
  // Paused clients: one line, so nobody forgets them ("can we show paused
  // clients in the morning brief"). No flags, no alerts: the pause is the
  // only news, and how long it has run is the only question.
  const paused = []
  for (const r of rows) {
    const client = pick(r.client)
    const flags = r.flags || []
    if (r.client.paused_at) {
      const since = String(r.client.paused_at).slice(0, 10)
      paused.push({ client, since, days: daysBetween(since, day) })
      continue
    }
    for (const f of flags) {
      if (AD_FLAGS.has(f.key)) {
        attention.push({ client, severity: f.severity, key: f.key, label: f.label, detail: f.detail || '', href: f.href || `/client/${client.id}` })
      }
    }
    for (const w of r.drop?.waiting || []) {
      clips.push({ client, key: 'clip', label: clipLabel(w, r.drop?.hasMeta !== false), href: '/content', at: w.at })
    }
    // The editor's dropped statics sit in the same list: finished work
    // waiting to go out, whichever shape it is.
    for (const s of r.statics || []) {
      clips.push({ client, key: 'static', label: staticLabel(s, r.drop?.hasMeta !== false), href: '/content', at: s.at })
    }
    // Live on any channel: Meta, Google Search or Local Services.
    const live = Boolean(r.result?.launched ?? r.client.meta_ads_active) && !r.client.paused_at
    if (live && !flags.some((f) => AD_FLAGS.has(f.key))) {
      const leads7 = r.leads?.leads7 || 0
      const before = Math.max(0, (r.leads?.leads14 || 0) - leads7)
      // Ads that started this week: "0" would read as a problem, and the
      // leads flags hold off until a week of spend, so the line says new.
      const spendDays14 = Number(r.leads?.spendDays14) || 0
      green.push({ client, leads7, before, spend7: r.leads?.spend7 || 0, isNew: spendDays14 > 0 && spendDays14 < 7 })
    }
    // In setup until the ad channels the package owes are live: a client not
    // launched, and a Whole Chain client live on Meta with Google still to
    // come ("on the 2500 tier they need Google and Meta connected and live").
    // Local Services open does not hold a client here.
    const steps = r.result?.steps || []
    const channelOpen = steps.some((s) => GATE_KEYS.has(s.key) && !s.done)
    if (!r.client.paused_at && (!r.result?.launched || channelOpen)) {
      const line = setupLine(r.result, r.client, r.drop)
      // The package and the day of onboarding they are on, so "day 40 and
      // Google still not connected" reads at a glance.
      const added = r.client.date_added ? String(r.client.date_added).slice(0, 10) : ''
      const dayN = added ? daysBetween(added, day) + 1 : 0
      const tierShort = TIER_BY_NUMBER[Number(r.tier)]?.short || 'no package set'
      onboarding.push({
        client,
        tag: `${tierShort}${dayN > 0 ? `, day ${dayN}` : ''}`,
        label: line.text,
        move: line.move,
        theirs: line.theirs,
        ours: !line.theirs,
        connected: line.connected,
        days: line.days,
        launched: Boolean(r.result?.launched),
      })
    }
  }
  const sev = { red: 0, amber: 1 }
  attention.sort((a, b) => sev[a.severity] - sev[b.severity] || a.client.name.localeCompare(b.client.name))
  clips.sort((a, b) => (a.at < b.at ? 1 : -1))
  green.sort((a, b) => b.leads7 - a.leads7 || a.client.name.localeCompare(b.client.name))
  paused.sort((a, b) => b.days - a.days || a.client.name.localeCompare(b.client.name))
  // Our moves first (the connected ones at the top: they are the ones a
  // video or a publish gets live), then the clients still to launch, then
  // the longest wait.
  onboarding.sort((a, b) => Number(b.ours) - Number(a.ours) || Number(b.connected) - Number(a.connected) || Number(a.launched) - Number(b.launched) || b.days - a.days || a.client.name.localeCompare(b.client.name))
  const red = attention.filter((a) => a.severity === 'red').length
  return {
    day,
    label: longDay(day),
    attention,
    clips,
    green,
    onboarding,
    paused,
    counts: {
      clients: rows.length,
      red,
      amber: attention.length - red,
      toCall: new Set(attention.map((a) => a.client.id)).size,
      clips: clips.length,
      // How many of those are dropped statics, so the subject can count
      // them without calling them clips.
      statics: clips.filter((c) => c.key === 'static').length,
      green: green.length,
      greenLeads: green.reduce((n, g) => n + g.leads7, 0),
      onboarding: onboarding.length,
      onboardingOurs: onboarding.filter((o) => o.ours).length,
      onboardingTheirs: onboarding.filter((o) => o.theirs).length,
      paused: paused.length,
    },
    weekly,
    appUrl: String(appUrl || '').replace(/\/$/, ''),
  }
}

/** The email subject and the Slack notification line. */
export function briefSubject(model) {
  const c = model.counts
  const bits = []
  if (c.toCall) bits.push(`${c.toCall} to call`)
  // "clips" while the list is clips alone; with a static in it, just the count.
  if (c.clips) bits.push(c.statics ? `${c.clips} to publish` : `${c.clips} clip${c.clips === 1 ? '' : 's'} to publish`)
  bits.push(`${c.green} running clean`)
  return `${model.weekly ? 'Monday brief and weekly status' : 'Morning brief'} · ${model.label} · ${bits.join(', ')}`
}

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
const slackEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const link = (model, href, text, kind = 'slack') => {
  const url = `${model.appUrl}${href}`
  // Slack text arrives escaped already; HTML is escaped here either way.
  if (!model.appUrl) return kind === 'html' ? esc(text) : text
  return kind === 'slack' ? `<${url}|${text}>` : kind === 'html' ? `<a href="${esc(url)}" style="color:#0f172a;font-weight:700;text-decoration:none;">${esc(text)}</a>` : text
}

/**
 * The brief as sections of lines: [{ key, title, lines: [{ emoji, client?, text, href? }] }].
 * Every rendering comes from this, so Slack, the email and the preview say
 * the same thing. Running clean and onboarding are ONE line each.
 */
export function briefSections(model) {
  const out = []
  if (model.attention.length) {
    out.push({
      key: 'attention',
      title: `Needs attention (${model.attention.length})`,
      lines: model.attention.map((a) => ({ emoji: EMOJI[a.key] || (a.severity === 'red' ? '🔴' : '🟠'), client: a.client, text: a.label, href: a.href })),
    })
  }
  if (model.clips.length) {
    out.push({ key: 'clips', title: `To publish (${model.clips.length})`, lines: model.clips.map((c) => ({ emoji: EMOJI[c.key] || EMOJI.clip, client: c.client, text: c.label, href: c.href })) })
  }
  if (model.green.length) {
    const names = model.green.map((g) => `${g.client.name} ${g.leads7}${g.leads7 > g.before ? '↑' : g.leads7 < g.before ? '↓' : ''}${g.isNew ? ' (new this week)' : ''}`).join(', ')
    out.push({ key: 'green', title: `Running clean (${model.green.length}), leads this week`, lines: [{ emoji: EMOJI.green, text: names, href: '/status' }] })
  }
  // Onboarding is two lists, so "what do we do today" is one glance: our
  // moves, then the clients we are waiting on.
  const ours = model.onboarding.filter((o) => !o.theirs)
  const theirs = model.onboarding.filter((o) => o.theirs)
  if (ours.length) {
    out.push({ key: 'onboarding', title: `Onboarding, our move (${ours.length})`, lines: ours.map((o) => ({ emoji: EMOJI.onboarding, client: o.client, tag: o.tag, text: o.label, href: `/client/${o.client.id}` })) })
  }
  if (theirs.length) {
    out.push({ key: 'onboarding-theirs', title: `Onboarding, waiting on the client (${theirs.length})`, lines: theirs.map((o) => ({ emoji: EMOJI.waiting, client: o.client, tag: o.tag, text: o.label, href: `/client/${o.client.id}` })) })
  }
  if (model.paused?.length) {
    const names = model.paused.map((p) => `${p.client.name} (${p.days === 0 ? 'paused today' : `since ${shortDay(p.since)}, ${p.days} day${p.days === 1 ? '' : 's'}`})`).join(', ')
    out.push({ key: 'paused', title: `On pause (${model.paused.length})`, lines: [{ emoji: EMOJI.paused, text: names, href: '/status' }] })
  }
  if (model.attention.length === 0 && model.clips.length === 0) {
    out.unshift({ key: 'clear', title: 'Nothing needs attention', lines: [{ emoji: '✅', text: 'No flags on any client this morning.' }] })
  }
  return out
}

/** Plain text, for the email's text part and the CRM preview. */
export function briefText(model) {
  const head = [`${model.weekly ? 'MONDAY BRIEF' : 'MORNING BRIEF'} · ${model.label}`, briefSubject(model).split(' · ').slice(2).join(' · ')]
  const body = briefSections(model).map((s) => [s.title.toUpperCase(), ...s.lines.map((l) => `${l.emoji} ${l.client ? `${l.client.name}${l.tag ? ` (${l.tag})` : ''}: ` : ''}${l.text}`)].join('\n'))
  const weekly = model.weekly ? [weeklyTextShort(model.weekly)] : []
  return [head.join('\n'), ...body, ...weekly, model.appUrl ? `${model.appUrl}/status` : ''].filter(Boolean).join('\n\n')
}

const pctWord = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '' : Math.abs(v) < 0.5 ? ' (same)' : ` (${v > 0 ? 'up' : 'down'} ${Math.round(Math.abs(v))}%)`)

/** The weekly status, short: the totals, the clients needing a decision in full, the rest by name. */
export function weeklyTextShort(report) {
  const t = report.totals
  const lines = [
    `WEEKLY STATUS · ${report.label}`,
    `${money(t.spend)} spent${pctWord(t.change.spend)} · ${t.leads} leads${pctWord(t.change.leads)} · ${t.leads > 0 ? `${money(t.cpl)} per lead${pctWord(t.change.cpl)}` : 'no leads'} · ${t.running} of ${t.clients} running`,
    `${t.up} trending up · ${t.down} down · ${t.needAds} need a new ad · ${t.adsOff} with ads off`,
  ]
  const decide = report.rows.filter((r) => r.rank <= 3)
  if (decide.length) lines.push('', `NEEDS A DECISION (${decide.length})`, ...decide.map((r) => `• ${weeklyLine(r)}`))
  const up = report.rows.filter((r) => r.rank === 8)
  if (up.length) lines.push('', `TRENDING UP: ${up.map((r) => `${r.client.name} (${r.trend.why.toLowerCase()})`).join(', ')}`)
  const steady = report.rows.filter((r) => r.rank === 7)
  if (steady.length) lines.push(`STEADY: ${steady.map((r) => r.client.name).join(', ')}`)
  // Ads in their first week: named, not judged.
  const fresh = report.rows.filter((r) => r.rank === 4)
  if (fresh.length) lines.push(`JUST STARTED: ${fresh.map((r) => `${r.client.name} (${money(r.now.spend)}, ${r.now.leads} lead${r.now.leads === 1 ? '' : 's'})`).join(', ')}`)
  return lines.join('\n')
}

// Slack caps a section's text at 3000 characters; lines are chunked under
// that so a long morning never comes back as "invalid_blocks".
const SLACK_SECTION_MAX = 2800

function slackSections(title, lines) {
  const blocks = []
  let text = `*${title}*`
  for (const l of lines) {
    if (text.length + l.length + 1 > SLACK_SECTION_MAX) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text } })
      text = l
    } else {
      text += `\n${l}`
    }
  }
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text } })
  return blocks
}

/** The brief as a Slack message: { text, blocks }. */
export function briefSlack(model) {
  const blocks = [{ type: 'header', text: { type: 'plain_text', text: `${model.weekly ? '📊 Monday brief' : '☀️ Morning brief'} · ${model.label}`, emoji: true } }]
  for (const s of briefSections(model)) {
    const lines = s.lines.map((l) => `${l.emoji} ${l.client ? `${link(model, l.href || `/client/${l.client.id}`, slackEsc(l.client.name))}${l.tag ? ` (${slackEsc(l.tag)})` : ''}: ` : ''}${slackEsc(l.text)}`)
    blocks.push(...slackSections(s.title, lines))
  }
  if (model.weekly) {
    const t = model.weekly.totals
    const pctMark = (v) => (v === null || v === undefined || !Number.isFinite(v) || Math.abs(v) < 0.5 ? '' : ` (${v > 0 ? '▲' : '▼'} ${Math.round(Math.abs(v))}%)`)
    blocks.push({ type: 'divider' })
    const lines = [
      `${money(t.spend)} spent${pctMark(t.change.spend)} · *${t.leads} leads*${pctMark(t.change.leads)} · ${t.leads > 0 ? `${money(t.cpl)} per lead${pctMark(t.change.cpl)}` : 'no leads'} · ${t.running} of ${t.clients} running`,
      `${t.up} trending up · ${t.down} down · ${t.needAds} need a new ad · ${t.adsOff} with ads off`,
    ]
    const decide = model.weekly.rows.filter((r) => r.rank <= 3)
    for (const r of decide) lines.push(`• ${link(model, `/client/${r.client.id}`, slackEsc(r.client.name))}: ${slackEsc(weeklyLine(r).replace(`${r.client.name}: `, ''))}`)
    const up = model.weekly.rows.filter((r) => r.rank === 8)
    if (up.length) lines.push(`📈 Trending up: ${up.map((r) => slackEsc(r.client.name)).join(', ')}`)
    const fresh = model.weekly.rows.filter((r) => r.rank === 4)
    if (fresh.length) lines.push(`🆕 Just started: ${fresh.map((r) => slackEsc(r.client.name)).join(', ')}`)
    blocks.push(...slackSections(`Weekly status · ${model.weekly.label}`, lines))
    if (model.appUrl) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `Full report: ${link(model, '/weekly', 'Weekly status in the CRM')}` }] })
  }
  if (model.appUrl) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `${link(model, '/status', 'Client tiers')} · ${link(model, '/content', 'Video board')} · ${link(model, '/tasks', 'Tasks')}` }] })
  return { text: briefSubject(model), blocks }
}

const INK = '#0f172a'
const MUTED = '#64748b'
const LINE = '#e2e8f0'

/** The brief as an email: inline-styled tables, no script, no web fonts. */
export function briefHtml(model, { agencyName = 'The Working Class Marketing' } = {}) {
  const section = (s) =>
    `<tr><td style="padding:14px 28px 4px;"><div style="font-size:12px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:.4px;">${esc(s.title)}</div></td></tr>` +
    s.lines
      .map((l) => `<tr><td style="padding:5px 28px;font-size:14px;line-height:1.45;color:${INK};">${l.emoji} ${l.client ? `${link(model, l.href || `/client/${l.client.id}`, l.client.name, 'html')}${l.tag ? ` <span style="color:${MUTED};">(${esc(l.tag)})</span>` : ''}: ` : ''}${esc(l.text)}</td></tr>`)
      .join('')
  const weekly = model.weekly
    ? `<tr><td style="padding:18px 28px 4px;border-top:1px solid ${LINE};"><div style="font-size:12px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:.4px;">Weekly status · ${esc(model.weekly.label)}</div></td></tr>` +
      `<tr><td style="padding:4px 28px 10px;font-size:13px;line-height:1.5;color:${INK};white-space:pre-wrap;">${esc(weeklyTextShort(model.weekly).split('\n').slice(1).join('\n'))}</td></tr>` +
      (model.appUrl ? `<tr><td style="padding:0 28px 12px;font-size:13px;">${link(model, '/weekly', 'Open the weekly status', 'html')}</td></tr>` : '')
    : ''
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F1F5F9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F5F9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;font-family:Arial,Helvetica,sans-serif;">
<tr><td style="padding:26px 28px 6px;">
  <div style="font-size:12px;color:#ea580c;font-weight:700;letter-spacing:.4px;text-transform:uppercase;">${model.weekly ? 'Monday brief' : 'Morning brief'}</div>
  <div style="font-size:22px;font-weight:700;color:${INK};padding-top:4px;">${esc(model.label)}</div>
  <div style="font-size:13px;color:${MUTED};padding-top:4px;">${esc(briefSubject(model).split(' · ').slice(2).join(' · '))}</div>
</td></tr>
${briefSections(model).map(section).join('')}
${weekly}
<tr><td style="padding:18px 28px 24px;border-top:1px solid ${LINE};font-size:12px;color:${MUTED};">${model.appUrl ? `${link(model, '/status', 'Client tiers', 'html')} · ${link(model, '/content', 'Video board', 'html')} · ${link(model, '/tasks', 'Tasks', 'html')} · ` : ''}${esc(agencyName)}</td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

// --- the alerts ------------------------------------------------------------------

/**
 * Everything that gets a post the moment it appears: one key per client per
 * thing. The immediate flags by their key; each waiting clip by its path, so
 * a second drop is a second post and a published one goes quiet.
 */
export function alertKeys(statusRows = [], { now = new Date() } = {}) {
  const out = []
  for (const r of statusRows.filter(active)) {
    const client = pick(r.client)
    for (const f of r.flags || []) {
      if (!isImmediate(f)) continue
      out.push({ key: `${client.id}:${f.key}`, client, kind: f.key, label: f.label, detail: f.key === 'account' ? f.detail || '' : '', href: f.href || `/client/${client.id}` })
    }
    const hasMeta = r.drop?.hasMeta !== false
    for (const w of r.drop?.waiting || []) {
      // Not yet in Meta and dropped minutes ago: the sweep is on it. Wait,
      // so the line says where the clip is rather than where it was.
      const meta = w.meta || (w.ready ? 'ready' : 'none')
      if (hasMeta && meta !== 'ready' && meta !== 'error' && now - new Date(w.at) < CLIP_HOLD_MS) continue
      // The editor's note rides along: it is the one thing the publisher
      // needs that the file name cannot say ("post these a day apart").
      out.push({ key: `${client.id}:clip:${w.path}`, client, kind: 'clip', label: `New edit dropped in: ${clipLabel(w, hasMeta)}`, detail: '', href: '/content' })
    }
    // Each dropped static by its stamp: a second drop is a second post, and
    // a published or cleared one goes quiet. No hold: nothing to wait for.
    for (const s of r.statics || []) {
      out.push({ key: `${client.id}:static:${s.stamp}`, client, kind: 'static', label: `New static dropped in: ${staticLabel(s, hasMeta)}`, detail: '', href: '/content' })
    }
  }
  return out
}

/**
 * The clients whose ads are live now: active, on Meta, not paused. Only
 * these can be said to have their ads "delivering again".
 */
export function liveClientIds(statusRows = []) {
  return new Set(statusRows.filter((r) => active(r) && r.client.meta_ads_active && !r.client.paused_at).map((r) => r.client.id))
}

/**
 * What to post: the keys live now that are not open in the log (fresh), and
 * the open ones that are gone and worth a word (cleared: the ads are back).
 * A clip going quiet or a stale client publishing is not news.
 *
 * An alert can also vanish because the CLIENT did: paused, archived, made
 * internal. Pausing takes every flag off a client, so its open "account in
 * grace period" disappeared and the channel read "Tito's Appliances: ads
 * delivering again" on the day they were paused. With `live` given, a gone
 * key is announced only when that client's ads are live; the rest close in
 * the log without a word.
 *
 * open: [{ key, kind, label, client_id, client_name }] rows with cleared_at null
 * live: Set of client ids whose ads are live (liveClientIds); omitted = all
 */
export function diffAlerts(current = [], open = [], { live } = {}) {
  const openKeys = new Set(open.map((o) => o.key))
  const nowKeys = new Set(current.map((c) => c.key))
  const stillLive = (o) => !live || live.has(o.client_id)
  return {
    fresh: current.filter((c) => !openKeys.has(c.key)),
    gone: open.filter((o) => !nowKeys.has(o.key)),
    cleared: open.filter((o) => !nowKeys.has(o.key) && CLEAR_WORTHY.has(o.kind) && stillLive(o)),
  }
}

/**
 * A person's first name, from a name ("Ethan", "Mary Jo Smith") or, failing
 * that, from an email ("ethan@horizonhvacinc.com"). The channel says "added
 * by Ethan", never "added by ethan@…" ("make all messages say by users
 * first name rather than their email").
 */
export function firstName(value) {
  const s = String(value || '').trim()
  if (!s) return ''
  const base = s.includes('@') ? s.split('@')[0].split(/[._+-]/)[0] : s.split(/\s+/)[0]
  const word = base.replace(/[^\p{L}'’-]/gu, '')
  return word ? word[0].toUpperCase() + word.slice(1) : ''
}

/**
 * The channel hears about a new client the moment they are added ("new
 * client added to agency for x dollars tier"): who, which package, what it
 * costs, and who added them. One message, never repeated.
 *
 * client: { id, name, tier, monthly_fee, setup_fee }
 * by: the name (or email) of whoever added them, or ''; shown as a first name
 */
export function clientAddedSlack(client, { appUrl = '', by = '' } = {}) {
  const t = TIER_BY_NUMBER[Number(client?.tier)] || null
  const monthly = Number(client?.monthly_fee) || t?.price || 0
  const setup = Number(client?.setup_fee) || 0
  const price = monthly ? `$${monthly.toLocaleString()}/mo` : 'no monthly fee set'
  const tierWords = t ? `${t.name} (${price}${setup ? `, $${setup.toLocaleString()} setup` : ''})` : `no tier picked yet (${price})`
  const model = { appUrl: String(appUrl || '').replace(/\/$/, '') }
  const name = String(client?.name || 'A client')
  const who = firstName(by)
  // An ad account picked on the add form rides along, so there is one post
  // for a new client, not two.
  const account = client?.meta_ad_account_id ? `\n🔗 Meta ad account ${slackEsc(String(client.meta_ad_account_id))} connected` : ''
  return {
    text: `New client: ${name}, ${t ? t.short : price}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `🎉 *New client added to the agency*\n${link(model, `/client/${client?.id || ''}`, slackEsc(name))}: ${slackEsc(tierWords)}${who ? ` · added by ${slackEsc(who)}` : ''}${account}` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `${link(model, `/client/${client?.id || ''}`, 'Their page')} · ${link(model, '/status', 'Client tiers')}` }] },
    ],
  }
}

/**
 * The channel hears when an ad account is connected to a client ("make CRM
 * update message when new ad account is connected to a client"): which
 * client, which channel, which account, who did it. Once per account.
 *
 * channel: 'meta' | 'google'
 * account: { id, name } (the Meta account name when the CRM knows it)
 */
export function accountConnectedSlack(client, { channel = 'meta', account = {}, appUrl = '', by = '' } = {}) {
  const model = { appUrl: String(appUrl || '').replace(/\/$/, '') }
  const name = String(client?.name || 'A client')
  const id = String(account?.id || '')
  const which = channel === 'google' ? `Google Ads account ${dashedId(id) || id}` : `Meta ad account ${account?.name ? `*${slackEsc(account.name)}* (${slackEsc(id)})` : slackEsc(id)}`
  const plain = channel === 'google' ? `Google Ads account ${dashedId(id) || id}` : `Meta ad account ${account?.name ? `${account.name} (${id})` : id}`
  const who = firstName(by)
  const href = channel === 'google' ? `/client/${client?.id || ''}#google` : `/client/${client?.id || ''}#meta`
  return {
    text: `Ad account connected: ${name}, ${plain}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `🔗 *Ad account connected*\n${link(model, href, slackEsc(name))}: ${which}${who ? ` · by ${slackEsc(who)}` : ''}` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `${link(model, href, 'Their page')} · ${link(model, '/status', 'Client tiers')}` }] },
    ],
  }
}

/**
 * A task ticked done ("whenever a user completes a task in the Tasks page
 * it sends a message saying what was completed and by who"): who, the task,
 * the client it was for and the list it was on. One line.
 *
 * task: { id, title, client_id, list_id }
 * client: { id, name } or null; list: { name } or null
 */
export function taskDoneSlack({ task = {}, client = null, list = null, by = '', appUrl = '' } = {}) {
  const model = { appUrl: String(appUrl || '').replace(/\/$/, '') }
  const who = firstName(by) || 'Someone'
  const title = String(task.title || 'a task').trim()
  const where = [client ? link(model, `/client/${client.id}`, slackEsc(client.name)) : '', list?.name ? slackEsc(list.name) : ''].filter(Boolean).join(' · ')
  const plainWhere = [client?.name, list?.name].filter(Boolean).join(' · ')
  return {
    text: `${who} finished: ${title}${plainWhere ? ` (${plainWhere})` : ''}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `✅ *${slackEsc(who)}* finished: ${link(model, '/tasks', slackEsc(title))}${where ? ` · ${where}` : ''}` } },
    ],
  }
}

/**
 * A task given to someone else ("when someone adds a task in Tasks for
 * someone else, it sends a message on Slack"): who gave it, to whom, the
 * task, the client, the list and when it is due. One line.
 *
 * task: { id, title, due_date }; to: the names it went to (not the giver)
 */
export function taskAssignedSlack({ task = {}, client = null, list = null, by = '', to = [], appUrl = '' } = {}) {
  const model = { appUrl: String(appUrl || '').replace(/\/$/, '') }
  const who = firstName(by) || 'Someone'
  const names = (Array.isArray(to) ? to : [to]).map((n) => firstName(n)).filter(Boolean)
  const whom = names.length === 0 ? 'someone' : names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const title = String(task.title || 'a task').trim()
  const due = task.due_date ? `due ${shortDay(String(task.due_date).slice(0, 10))}` : ''
  const where = [client ? link(model, `/client/${client.id}`, slackEsc(client.name)) : '', list?.name ? slackEsc(list.name) : '', due].filter(Boolean).join(' · ')
  const plainWhere = [client?.name, list?.name, due].filter(Boolean).join(' · ')
  return {
    text: `${who} gave ${whom} a task: ${title}${plainWhere ? ` (${plainWhere})` : ''}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `📋 *${slackEsc(who)}* gave *${slackEsc(whom)}* a task: ${link(model, '/tasks', slackEsc(title))}${where ? ` · ${where}` : ''}` } },
    ],
  }
}

/**
 * Ken's onboarding tasks, made the moment a client is added ("when we add a
 * new client, automatically add tasks for Ken... and make sure it messages
 * CRM updates about Ken's new tasks"): one post, not one per task. Who
 * added the client, who the tasks are for, how many, which client, and each
 * task on its own line (with a due day only if somebody set one; the tasks
 * are made without).
 *
 * tasks: rows { id, title, assignees, due_date }
 */
export function onboardingTasksSlack({ client = null, tasks = [], by = '', appUrl = '' } = {}) {
  const list = (Array.isArray(tasks) ? tasks : []).filter(Boolean)
  if (!list.length) return null
  const model = { appUrl: String(appUrl || '').replace(/\/$/, '') }
  const who = firstName(by) || 'Someone'
  const people = [...new Set(list.flatMap((t) => (Array.isArray(t.assignees) ? t.assignees : [])).map((n) => firstName(n)).filter(Boolean))]
  const whom = people.length === 0 ? 'someone' : people.length === 1 ? people[0] : `${people.slice(0, -1).join(', ')} and ${people[people.length - 1]}`
  const name = String(client?.name || 'a client')
  const count = `${list.length} onboarding task${list.length === 1 ? '' : 's'}`
  const dueOf = (t) => (t.due_date ? `due ${shortDay(String(t.due_date).slice(0, 10))}` : '')
  const plain = list.map((t) => `${String(t.title || 'a task').trim()}${dueOf(t) ? ` (${dueOf(t)})` : ''}`).join(', ')
  const lines = list.map((t) => `• ${link(model, '/tasks', slackEsc(String(t.title || 'a task').trim()))}${dueOf(t) ? ` · ${dueOf(t)}` : ''}`).join('\n')
  const href = `/client/${client?.id || ''}`
  return {
    text: `${who} gave ${whom} ${count} for ${name}: ${plain}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `📋 *${slackEsc(who)}* gave *${slackEsc(whom)}* ${count} for ${link(model, href, slackEsc(name))}:\n${lines}` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `${link(model, '/tasks', 'Tasks')} · ${link(model, href, 'Their page')}` }] },
    ],
  }
}

/**
 * Ads published to Meta from the CRM ("did you make so when we publish
 * videos it sends a CRM update"): who, how many and of what kind, for which
 * client, named, the campaign, and that they land paused. One post per
 * publish; the function announces each ad once.
 *
 * ads: published_ads rows { ad_id, ad_name, video_id, campaign_name }
 */
export function adsPublishedSlack({ client = null, ads = [], by = '', appUrl = '' } = {}) {
  const list = (Array.isArray(ads) ? ads : []).filter(Boolean)
  if (!list.length) return null
  const model = { appUrl: String(appUrl || '').replace(/\/$/, '') }
  const who = firstName(by) || 'Someone'
  const name = String(client?.name || 'a client')
  const videos = list.filter((a) => a.video_id).length
  const kind = videos === list.length ? 'video ad' : videos === 0 ? 'image ad' : 'ad'
  const what = `${list.length} ${kind}${list.length === 1 ? '' : 's'}${kind === 'ad' ? ` (${videos} video, ${list.length - videos} image)` : ''}`
  const names = list.map((a) => String(a.ad_name || a.ad_id || 'an ad').trim())
  const campaigns = [...new Set(list.map((a) => String(a.campaign_name || '').trim()).filter(Boolean))]
  const tail = [campaigns.length ? `campaign ${campaigns.join(', ')}` : '', 'paused until switched on in Ads Manager'].filter(Boolean).join(' · ')
  const href = `/client/${client?.id || ''}#meta`
  return {
    text: `${who} published ${what} to Meta for ${name}: ${names.join(', ')} (${tail})`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `🚀 *${slackEsc(who)}* published *${slackEsc(what)}* to Meta for ${link(model, href, slackEsc(name))}: ${slackEsc(names.join(', '))} · ${slackEsc(tail)}` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `${link(model, href, 'Their Meta panel')} · ${link(model, '/content', 'Video board')}` }] },
    ],
  }
}

export const FORM_WORDS = {
  intake: 'filled in their onboarding form',
  ghl: 'sent back their GHL account details',
}

/**
 * The channel hears when a client fills in a form ("make so CRM updates
 * sends message when client fills out onboarding form"): one line per
 * submission, the client linked to their page where the answers are.
 *
 * items: [{ client: { id, name }, form: 'intake' | 'ghl', at, task? }]
 *   task: the task the form made ("Ethan: send the video scripts"), when
 *         the database made one (supabase/scripts-task.sql), so the line
 *         says who has the next move.
 */
export function formSubmittedSlack(items = [], { appUrl = '' } = {}) {
  if (!items.length) return null
  const model = { appUrl: String(appUrl || '').replace(/\/$/, '') }
  const tail = (it) => (it.task ? ` · task for ${it.task}` : '')
  const line = (it) => `${slackEsc(it.client?.name || 'A client')} ${FORM_WORDS[it.form] || 'filled in a form'}${tail(it)}`
  const lines = items.map((it) => `📝 ${link(model, `/client/${it.client?.id || ''}`, slackEsc(it.client?.name || 'A client'))} ${FORM_WORDS[it.form] || 'filled in a form'}${it.task ? ` · task for ${slackEsc(it.task)}` : ''}`)
  return {
    text: items.map(line).join(' · '),
    blocks: [
      ...slackSections(items.length === 1 ? 'Form in' : `Forms in (${items.length})`, lines),
      { type: 'context', elements: [{ type: 'mrkdwn', text: `${link(model, '/status', 'Client tiers')} · the answers are on each client’s page` }] },
    ],
  }
}

/**
 * The channel hears when a client's Drive folder is linked ("send CRM
 * update when Google Drive is linked"): which client, who linked it, and
 * the folder itself to open. One line per folder; several when the sweep
 * catches up at once.
 *
 * items: [{ client: { id, name }, folderId, by }]
 */
export function driveLinkedSlack(items = [], { appUrl = '' } = {}) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean)
  if (!list.length) return null
  const model = { appUrl: String(appUrl || '').replace(/\/$/, '') }
  const plain = (it) => {
    const who = firstName(it.by)
    return `Drive folder linked for ${String(it.client?.name || 'A client')}${who ? ` by ${who}` : ''}`
  }
  const line = (it) => {
    const name = link(model, `/client/${it.client?.id || ''}`, slackEsc(it.client?.name || 'A client'))
    const open = it.folderId ? ` · <https://drive.google.com/drive/folders/${encodeURIComponent(String(it.folderId))}|open the folder>` : ''
    const who = firstName(it.by)
    return `📁 ${name}${who ? ` · by ${slackEsc(who)}` : ''}${open}`
  }
  return {
    text: list.map(plain).join(' · '),
    blocks: [
      ...slackSections(list.length === 1 ? 'Drive folder linked' : `Drive folders linked (${list.length})`, list.map(line)),
      { type: 'context', elements: [{ type: 'mrkdwn', text: `${link(model, '/content', 'Video board')} · what they add there shows up in Make Static Ads` }] },
    ],
  }
}

/** The alerts as a Slack message, or null when there is nothing to say. */
export function alertsSlack({ fresh = [], cleared = [] }, { appUrl = '' } = {}) {
  if (fresh.length === 0 && cleared.length === 0) return null
  const model = { appUrl: String(appUrl || '').replace(/\/$/, '') }
  const blocks = []
  if (fresh.length) {
    const lines = fresh.map((f) => `${EMOJI[f.kind] || '🔴'} ${link(model, f.href || `/client/${f.client.id}`, slackEsc(f.client.name))}: ${slackEsc(f.label)}${f.detail ? ` _${slackEsc(f.detail).slice(0, 160)}_` : ''}`)
    blocks.push(...slackSections(fresh.length === 1 ? 'New' : `New (${fresh.length})`, lines))
  }
  if (cleared.length) {
    const lines = cleared.map((c) => `${EMOJI.cleared} ${link(model, `/client/${c.client_id}`, slackEsc(c.client_name || 'A client'))}: ads delivering again (was "${slackEsc(c.label)}")`)
    blocks.push(...slackSections('Cleared', lines))
  }
  const text = fresh.length ? `${fresh.slice(0, 3).map((f) => `${f.client.name}: ${f.label}`).join(' · ')}${fresh.length > 3 ? ` · and ${fresh.length - 3} more` : ''}` : `${cleared.map((c) => c.client_name).join(', ')}: ads delivering again`
  return { text, blocks }
}
