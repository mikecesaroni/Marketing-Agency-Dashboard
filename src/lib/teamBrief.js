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
//   * The BRIEF is one message a weekday morning. One line per thing, no
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
import { money, weeklyLine } from './weeklyStatus.js'

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
  green: '🟢',
  onboarding: '⚪',
  paused: '⏸️',
  cleared: '✅',
}

const pick = (c) => ({ id: c.id, name: c.name })
const active = (r) => r?.client && !r.client.archived && !r.client.is_internal

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
      clips.push({ client, key: 'clip', label: `${w.name}${w.by ? ` from ${w.by}` : ''}${w.ready ? '' : ', not in Meta yet'}${w.note ? ` · “${w.note}”` : ''}`, href: '/content', at: w.at })
    }
    // Live on any channel: Meta, Google Search or Local Services.
    const live = Boolean(r.result?.launched ?? r.client.meta_ads_active) && !r.client.paused_at
    if (live && !flags.some((f) => AD_FLAGS.has(f.key))) {
      const leads7 = r.leads?.leads7 || 0
      const before = Math.max(0, (r.leads?.leads14 || 0) - leads7)
      green.push({ client, leads7, before, spend7: r.leads?.spend7 || 0 })
    }
    if (!r.result?.launched && !r.client.paused_at) {
      const next = r.result?.next
      const days = Number(next?.waitingDays) || 0
      const theirs = next?.owner === 'client'
      onboarding.push({ client, label: next ? `${next.title}${theirs ? ` (their move${days >= 7 ? `, ${days} days` : ''})` : ''}` : 'nothing open', theirs, days })
    }
  }
  const sev = { red: 0, amber: 1 }
  attention.sort((a, b) => sev[a.severity] - sev[b.severity] || a.client.name.localeCompare(b.client.name))
  clips.sort((a, b) => (a.at < b.at ? 1 : -1))
  green.sort((a, b) => b.leads7 - a.leads7 || a.client.name.localeCompare(b.client.name))
  paused.sort((a, b) => b.days - a.days || a.client.name.localeCompare(b.client.name))
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
      green: green.length,
      greenLeads: green.reduce((n, g) => n + g.leads7, 0),
      onboarding: onboarding.length,
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
  if (c.clips) bits.push(`${c.clips} clip${c.clips === 1 ? '' : 's'} to publish`)
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
    out.push({ key: 'clips', title: `To publish (${model.clips.length})`, lines: model.clips.map((c) => ({ emoji: EMOJI.clip, client: c.client, text: c.label, href: c.href })) })
  }
  if (model.green.length) {
    const names = model.green.map((g) => `${g.client.name} ${g.leads7}${g.leads7 > g.before ? '↑' : g.leads7 < g.before ? '↓' : ''}`).join(', ')
    out.push({ key: 'green', title: `Running clean (${model.green.length}), leads this week`, lines: [{ emoji: EMOJI.green, text: names, href: '/status' }] })
  }
  if (model.onboarding.length) {
    out.push({ key: 'onboarding', title: `Onboarding (${model.onboarding.length})`, lines: model.onboarding.map((o) => ({ emoji: EMOJI.onboarding, client: o.client, text: o.label, href: `/client/${o.client.id}` })) })
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
  const body = briefSections(model).map((s) => [s.title.toUpperCase(), ...s.lines.map((l) => `${l.emoji} ${l.client ? `${l.client.name}: ` : ''}${l.text}`)].join('\n'))
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
    const lines = s.lines.map((l) => `${l.emoji} ${l.client ? `${link(model, l.href || `/client/${l.client.id}`, slackEsc(l.client.name))}: ` : ''}${slackEsc(l.text)}`)
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
      .map((l) => `<tr><td style="padding:5px 28px;font-size:14px;line-height:1.45;color:${INK};">${l.emoji} ${l.client ? `${link(model, l.href || `/client/${l.client.id}`, l.client.name, 'html')}: ` : ''}${esc(l.text)}</td></tr>`)
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
export function alertKeys(statusRows = []) {
  const out = []
  for (const r of statusRows.filter(active)) {
    const client = pick(r.client)
    for (const f of r.flags || []) {
      if (!isImmediate(f)) continue
      out.push({ key: `${client.id}:${f.key}`, client, kind: f.key, label: f.label, detail: f.key === 'account' ? f.detail || '' : '', href: f.href || `/client/${client.id}` })
    }
    for (const w of r.drop?.waiting || []) {
      // The editor's note rides along: it is the one thing the publisher
      // needs that the file name cannot say ("post these a day apart").
      out.push({ key: `${client.id}:clip:${w.path}`, client, kind: 'clip', label: `New edit dropped in: ${w.name}${w.by ? ` from ${w.by}` : ''}${w.ready ? '' : ', not in Meta yet'}${w.note ? ` · “${w.note}”` : ''}`, detail: '', href: '/content' })
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
    text: `New client: ${name}, ${t ? `${t.short} tier at ${price}` : price}`,
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

export const FORM_WORDS = {
  intake: 'filled in their onboarding form',
  ghl: 'sent back their GHL account details',
}

/**
 * The channel hears when a client fills in a form ("make so CRM updates
 * sends message when client fills out onboarding form"): one line per
 * submission, the client linked to their page where the answers are.
 *
 * items: [{ client: { id, name }, form: 'intake' | 'ghl', at }]
 */
export function formSubmittedSlack(items = [], { appUrl = '' } = {}) {
  if (!items.length) return null
  const model = { appUrl: String(appUrl || '').replace(/\/$/, '') }
  const line = (it) => `${slackEsc(it.client?.name || 'A client')} ${FORM_WORDS[it.form] || 'filled in a form'}`
  const lines = items.map((it) => `📝 ${link(model, `/client/${it.client?.id || ''}`, slackEsc(it.client?.name || 'A client'))} ${FORM_WORDS[it.form] || 'filled in a form'}`)
  return {
    text: items.map(line).join(' · '),
    blocks: [
      ...slackSections(items.length === 1 ? 'Form in' : `Forms in (${items.length})`, lines),
      { type: 'context', elements: [{ type: 'mrkdwn', text: `${link(model, '/status', 'Client tiers')} · the answers are on each client’s page` }] },
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
