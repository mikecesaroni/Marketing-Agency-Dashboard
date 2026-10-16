// The Video Script Studio, the pure half.
//
// Clients open a private link (/scripts/<token>, the same token as their
// dashboard) and get video scripts to read into a phone: written from
// everything the CRM knows about them (the intake, their website, what is
// working in their ads, the season, how they talk) and shaped by three or
// four taps (what it is about, how long, who is on camera, where).
//
// This file is shared three ways, which is why it is plain JavaScript with
// no imports: the script-studio Edge Function (Deno) builds the brief and
// parses the reply with it, the browser page reads the menus and the
// timing from it, and scripts/check-script-studio.mjs tests it in Node.
// The season playbook (src/lib/seasonPlaybook.js) stays in the browser,
// which sends its text along with the ask; it is a paragraph about the
// time of year, nothing anyone could abuse.

// ---------------------------------------------------------------------------
// the menus: what a client can tap
// ---------------------------------------------------------------------------

export const TOPICS = [
  { key: 'season', label: 'This month’s offer', hint: 'the deal you are running right now, or the one the season calls for' },
  { key: 'problem', label: 'A problem I fix every week', hint: 'the call you get most this time of year, and what you do about it' },
  { key: 'owner', label: 'Meet the owner', hint: 'who you are, how long you have done this, what you refuse to do' },
  { key: 'review', label: 'A happy customer', hint: 'a real review or a real job, told like a story' },
  { key: 'before_after', label: 'Before and after', hint: 'the old unit out, the new one in, what changed for the family' },
  { key: 'tip', label: 'A quick tip', hint: 'one thing a homeowner can check or do this month' },
  { key: 'faq', label: 'A question I always get', hint: 'answer it once, on camera, the way you do on the phone' },
  { key: 'emergency', label: 'When it breaks', hint: 'no heat, no AC, a leak: how fast you come and what happens on the visit' },
  { key: 'plan', label: 'Tune-up or plan', hint: 'what is included, what it costs, what it prevents' },
  { key: 'objection', label: 'Why we cost what we cost', hint: 'meet the price worry head on and answer it' },
]

export const LENGTHS = [
  { key: '15', label: '15 seconds', hint: 'one point, fast', seconds: 15 },
  { key: '30', label: '30 seconds', hint: 'the sweet spot', seconds: 30 },
  { key: '60', label: '60 seconds', hint: 'room for a story', seconds: 60 },
]

export const SPEAKERS = [
  { key: 'owner', label: 'Just me, talking to the camera' },
  { key: 'tech', label: 'Me and a tech, on a job' },
  { key: 'voiceover', label: 'My voice over clips of the work' },
]

export const SETTINGS = [
  { key: 'truck', label: 'In the truck' },
  { key: 'job', label: 'At a job' },
  { key: 'shop', label: 'In the shop or office' },
  { key: 'home', label: 'At a customer’s home' },
]

export const TONES = [
  { key: 'straight', label: 'Straight talk' },
  { key: 'friendly', label: 'Friendly neighbour' },
  { key: 'funny', label: 'A little funny' },
]

/** One-tap changes to a script that is already written. */
export const CHANGES = [
  { key: 'shorter', label: 'Shorter', ask: 'Make it shorter: cut it to about two thirds of the words, keep the hook and the call to action, lose the weakest line.' },
  { key: 'punchier', label: 'Punchier', ask: 'Make it punchier: shorter sentences, a sharper first line, one strong verb per line, no throat-clearing.' },
  { key: 'casual', label: 'More casual', ask: 'Make it more casual: the way the owner would say it to a neighbour over the fence. Contractions, plain words, no sales voice.' },
  { key: 'like_me', label: 'More like how I talk', ask: 'Rewrite it in the owner’s own voice, matching HOW THEY TALK below as closely as the facts allow: their words, their rhythm, their sign-off.' },
  { key: 'angle', label: 'Different angle', ask: 'Same topic, a different angle: open on a different hook and build the script around a different reason to call. Do not reuse the first line.' },
  { key: 'offer', label: 'Lead with the offer', ask: 'Put the offer in the first line and make the whole script about why it is on now and what it is worth. Real prices only.' },
]

/** Reading pace for a person talking to a phone, words a second. */
export const WORDS_PER_SECOND = 2.5

export const STATUSES = ['new', 'saved', 'filmed', 'archived']

/** The most scripts one link may write in a day. Plenty for a client, a wall for anyone else. */
export const DAILY_LIMIT = 40

const topicLabel = (key) => TOPICS.find((t) => t.key === key)?.label || 'a video'
const lengthOf = (key) => LENGTHS.find((l) => l.key === String(key)) || LENGTHS[1]
const labelOf = (list, key, fallback = '') => list.find((x) => x.key === key)?.label || fallback

export function wordCount(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

/** About how long the spoken lines take, in seconds. */
export function secondsFor(lines) {
  const words = (Array.isArray(lines) ? lines : []).reduce((n, l) => n + wordCount(l?.say), 0)
  return Math.max(3, Math.round(words / WORDS_PER_SECOND))
}

// ---------------------------------------------------------------------------
// what is working: plain lines from the ad numbers
// ---------------------------------------------------------------------------

/** The hook in a WC ad name: "WC_Fall | 2026-09-20 | Furnace tune-up" is "Furnace tune-up". */
export function hookFromAdName(name) {
  const parts = String(name || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
  const last = parts[parts.length - 1] || ''
  if (parts.length >= 2 && last) return last
  // One part: "WC_Search" is the search campaign, so the prefix goes and
  // the word stays.
  return String(name || '').replace(/^WC_/, '').trim()
}

/** ad_daily rows into one row per ad, most leads first. */
export function aggregateAds(rows) {
  const by = new Map()
  for (const r of rows || []) {
    const key = r.ad_id || r.ad_name
    if (!key) continue
    const b = by.get(key) || { ad_id: r.ad_id || '', name: r.ad_name || '', leads: 0, spend: 0 }
    b.leads += Number(r.leads) || 0
    b.spend += Number(r.spend) || 0
    if (!b.name && r.ad_name) b.name = r.ad_name
    by.set(key, b)
  }
  return [...by.values()].sort((a, b) => b.leads - a.leads || a.spend - b.spend)
}

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`

/**
 * Up to four plain lines a client can read about their own ads: the ads
 * that brought leads (with the hook from the ad name), and the jobs they
 * told us were booked. `ads` is aggregateAds() output; `weeks` is the
 * weekly reports with their answers.
 */
export function workingLines({ ads = [], weeks = [], days = 90 } = {}) {
  const out = []
  const withLeads = ads.filter((a) => a.leads > 0).slice(0, 3)
  for (const a of withLeads) {
    const hook = hookFromAdName(a.name) || 'that'
    const cpl = a.leads > 0 && a.spend > 0 ? `, about ${money(a.spend / a.leads)} each` : ''
    out.push({
      kind: 'ad',
      hook,
      text: `Your “${hook}” ad brought ${Math.round(a.leads)} lead${Math.round(a.leads) === 1 ? '' : 's'} in the last ${days} days${cpl}.`,
    })
  }
  const booked = (weeks || []).filter((w) => Number(w.jobs_booked) > 0)
  if (booked.length) {
    const jobs = booked.reduce((n, w) => n + Number(w.jobs_booked), 0)
    const revenue = booked.reduce((n, w) => n + (Number(w.revenue) || 0), 0)
    out.push({
      kind: 'jobs',
      text: `You told us ${jobs} job${jobs === 1 ? ' was' : 's were'} booked from the ads over ${booked.length} week${booked.length === 1 ? '' : 's'}${revenue > 0 ? `, worth about ${money(revenue)}` : ''}.`,
    })
  }
  if (out.length === 0 && ads.length > 0) {
    out.push({ kind: 'none', text: 'Your ads are running. The first leads will show up here, and the scripts will lean on whatever brings them.' })
  }
  return out.slice(0, 4)
}

// ---------------------------------------------------------------------------
// the picks: three things to film this week
// ---------------------------------------------------------------------------

const firstSentence = (text) => {
  const s = String(text || '').trim()
  const m = s.match(/^[^.!?]*[.!?]/)
  return (m ? m[0] : s).trim()
}

/**
 * Three ready picks for the week, from the season (the phase's lead hook
 * and offer), what is working (the best ad's angle) and proof (reviews),
 * with "meet the owner" and a tip as the fallbacks. `used` is the topics
 * written in the last week, so the picks move on; never two of a topic.
 */
export function ideasFor({ phase, working = [], has = {}, used = [] } = {}) {
  const ideas = []
  const usedTopics = new Set(used || [])
  const push = (idea) => {
    if (ideas.length >= 3) return
    if (ideas.some((i) => i.topic === idea.topic)) return
    if (usedTopics.has(idea.topic)) return
    ideas.push(idea)
  }
  const month = phase?.month || ''
  const hook = phase?.hooks?.[0]
  if (hook) {
    push({
      key: 'season',
      topic: 'season',
      title: hook,
      why: `${month ? `It is ${month}: ` : ''}${String(phase.label || '').toLowerCase()}. ${firstSentence(phase.summary)}`.trim(),
      length: '30',
    })
  }
  const best = working.find((w) => w.kind === 'ad')
  if (best) {
    push({ key: 'working', topic: 'problem', title: `More of what is working: ${best.hook}`, why: `${best.text} Say the same thing on camera.`, length: '30' })
  }
  if (has.reviews) {
    push({ key: 'proof', topic: 'review', title: 'The review that says it best', why: `${has.reviews} on Google is the strongest thing you can say on camera. Tell one of those stories.`, length: '30' })
  }
  push({ key: 'owner', topic: 'owner', title: 'Meet the owner', why: 'People hire the person. Thirty seconds of you beats any stock photo.', length: '30' })
  for (const h of (phase?.hooks || []).slice(1)) {
    push({ key: `hook-${ideas.length}`, topic: 'emergency', title: h, why: `Another thing homeowners are thinking about in ${month || 'this month'}.`, length: '15' })
  }
  push({ key: 'tip', topic: 'tip', title: 'One thing to check this month', why: 'A tip costs nothing and gets shared. It makes you the one they call later.', length: '15' })
  push({ key: 'faq', topic: 'faq', title: 'The question I get every week', why: 'Answer it once on camera and send people the video.', length: '30' })
  return ideas.slice(0, 3)
}

// ---------------------------------------------------------------------------
// the brief: the system prompt, built from the CRM's facts
// ---------------------------------------------------------------------------

const val = (v) => {
  const s = String(v ?? '').trim()
  return s || 'not on file'
}
const yesNo = (v) => (v === true ? 'yes' : v === false ? 'no' : 'not on file')

/** How the owner talks, as one block: the voice sheet and excerpts of their own videos. */
export function voiceBlock(voice, transcripts = []) {
  const v = voice || {}
  const lines = []
  if (v.goes_by) lines.push(`The owner goes by ${v.goes_by}.`)
  lines.push(`Speaks as ${v.person === 'we' ? '"we" (the company)' : v.person === 'i' ? '"I" (the owner)' : '"I" for the owner and "we" for the crew'}.`)
  lines.push(`Tone: ${labelOf(TONES, v.tone, 'straight talk, friendly').toLowerCase()}.`)
  if (v.avoid) lines.push(`Words they never say: ${v.avoid}.`)
  if (v.sign_off) lines.push(`How they sign off: "${v.sign_off}".`)
  if (v.notes) lines.push(`Notes: ${v.notes}`)
  const samples = (transcripts || []).map((t) => String(t || '').trim()).filter(Boolean)
  if (samples.length) {
    lines.push('', 'How they actually sound, from videos they have made (match the rhythm and the words, not the content):')
    for (const s of samples.slice(0, 4)) lines.push(`“${s.slice(0, 600)}${s.length > 600 ? '…' : ''}”`)
  }
  return lines.join('\n')
}

/**
 * The system prompt. `facts` is what the Edge Function gathered (the
 * client row, the intake, the website fact sheet, the ad results as
 * workingLines, hooks already used, transcripts, the voice sheet).
 * `playbook` is the season paragraph the browser sent.
 */
export function buildScriptBrief(facts, { playbook = '', today = new Date() } = {}) {
  const f = facts || {}
  const i = f.intake || {}
  const name = i.business_name || f.name || 'this company'
  const owner = String(i.owner_name || f.voice?.goes_by || '').trim()
  const date = today instanceof Date ? today : new Date(today)
  const dateLabel = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const working = (f.working || []).map((w) => `- ${w.text}`).join('\n')
  const usedHooks = (f.usedHooks || []).filter(Boolean)
  const recent = (f.recentScripts || []).filter(Boolean)

  return `You write short videos for one home-services company: ${name}. ${owner ? `The owner, ${owner},` : 'The owner'} reads your script into a phone camera and posts it, so every spoken line is the owner talking in the first person ("I", "we", "my crew", "our trucks"), never about the owner in the third person. Anything that is a direction rather than a line speaks to the owner as "you".

Today is ${dateLabel}.

=== THE COMPANY (from our CRM; do not ask for any of this) ===
Business: ${name}
Trade: ${val(i.industry_trade || f.industry)}
Home base: ${val(i.service_area || f.market)}
Towns they serve: ${val(i.target_cities)}
Years in business: ${val(i.years_in_business)}
Services: ${val(i.services_offered)}
The job they want more of: ${val(i.most_profitable_service || i.service_want_more)}
Rough prices: ${val(i.typical_price_range)}
Jobs they do not want: ${val(i.jobs_to_avoid)}
Why people choose them: ${val(i.why_people_choose)}
Their ideal customer: ${val(i.ideal_customer)}
The objection they hear most: ${val(i.most_common_objection)}
Offers and guarantees they run: ${val(i.current_offers_guarantees)}
The offer that gets leads: ${val(i.cta_offering)}${i.offer_headline ? `\nOffer headline: ${i.offer_headline}${i.offer_fine_print ? ` (${i.offer_fine_print})` : ''}` : ''}
Guarantee: ${val(i.guarantee)}
Financing: ${yesNo(i.financing_available)}
Google reviews: ${val(i.reviews_star_rating)} stars, ${val(i.reviews_count)} reviews
Licensed, insured, certified: ${val(i.licensed_insured_certified)}
Phone to say on camera: ${val(i.phone_for_ads)}
Booking link: ${val(i.booking_url)}
Words to avoid: ${val(i.words_to_avoid)}
Busy and slow seasons: ${val(i.busy_season)}
${f.website ? `\n=== THEIR WEBSITE, AS A FACT SHEET ===\n${String(f.website).slice(0, 6000)}\n` : ''}
=== WHAT IS WORKING IN THEIR ADS ===
${working || 'No lead numbers yet. Lean on the offer, the proof and the season.'}
${usedHooks.length ? `\nHooks already used in their ads (do not open with these): ${usedHooks.slice(0, 12).join(' | ')}` : ''}
${recent.length ? `Scripts already written for them lately (do not repeat these): ${recent.slice(0, 12).join(' | ')}` : ''}

=== HOW THEY TALK ===
${voiceBlock(f.voice, f.transcripts)}

=== THE TIME OF YEAR ===
${playbook || 'No season notes. Write to what the company sells now.'}

=== RULES ===
- Plain words a neighbour would use. No marketing words: unlock, elevate, solutions, seamless, premier, hassle-free, top-notch.
- Real facts only: their prices, their towns, their review numbers, their offers, from above. Nothing invented. If a fact is not on file, leave it out rather than guess. No brackets, no placeholders.
- Never a licence, registration, policy or any other ID number. "Licensed and insured" is as far as it goes, and only if true of them.
- The first line is the hook: the thing that stops a thumb. Say the point in the first three seconds.
- One clear call to action at the end, with their real phone number when it is on file, otherwise "the link below".
- Match the length asked for: about ${WORDS_PER_SECOND} words a second of speaking (15 seconds is about 38 words, 30 is about 75, 60 is about 150). Count the spoken words.
- Four to eight spoken lines. Each line is one breath: one or two short sentences. The words only: no camera directions, no stage notes.
- No em dashes anywhere. No hashtags in the spoken lines (the caption may have two or three).
- No emoji. No on-screen text or captions to burn in; the owner just talks, and we add any text in the edit.

=== OUTPUT ===
Reply with one JSON object and nothing else, no markdown fence, no words before or after:
{
  "title": "four to six words, what this video is",
  "why_now": "one sentence on why this one, this week",
  "seconds": 30,
  "hook": "the first spoken line, exactly as in lines[0].say",
  "lines": [
    { "say": "the words the owner says, one breath" }
  ],
  "caption": "the caption to post with it: two short lines, the offer and the phone or link, then two or three hashtags",
  "cta": "the one thing the viewer should do, as the owner says it",
  "film_it": "where to stand, what to show, one or two sentences, speaking to the owner as you"
}`
}

/**
 * The ask for one script, from the taps: `ask` is { topic, length, speaker,
 * setting, tone, extra, idea } where idea is a pick from ideasFor() when one
 * was tapped.
 */
export function scriptAsk(ask = {}) {
  const topic = TOPICS.find((t) => t.key === ask.topic) || TOPICS[0]
  const len = lengthOf(ask.length)
  const speaker = labelOf(SPEAKERS, ask.speaker, SPEAKERS[0].label)
  const setting = labelOf(SETTINGS, ask.setting, '')
  const tone = labelOf(TONES, ask.tone, '')
  const lines = [`Write one ${len.seconds}-second video script (about ${Math.round(len.seconds * WORDS_PER_SECOND)} spoken words).`]
  if (ask.idea?.title) lines.push(`It is this one: "${ask.idea.title}". ${ask.idea.why || ''}`.trim())
  lines.push(`What it is about: ${topic.label.toLowerCase()} (${topic.hint}).`)
  lines.push(`Who is on camera: ${speaker.toLowerCase()}.${setting ? ` Filmed ${setting.toLowerCase()}.` : ''}${tone ? ` Tone: ${tone.toLowerCase()}.` : ''}`)
  if (ask.speaker === 'voiceover') lines.push('A voiceover: the owner is heard, not seen, over clips of the work they can film in a day; say so in film_it.')
  if (ask.speaker === 'tech') lines.push('Two people: give the tech at most two short lines and mark them in "say" as "Tech: ...". The rest is the owner.')
  const extra = String(ask.extra || '').trim()
  if (extra) lines.push(`The owner adds: "${extra.slice(0, 600)}". Work it in, as long as it is true to the facts above.`)
  lines.push('Return the JSON object only.')
  return lines.join('\n')
}

/** The ask for a one-tap change to a script that exists. */
export function reviseAsk(script, changeKey, extra = '') {
  const change = CHANGES.find((c) => c.key === changeKey)
  const lines = ['Here is the script as it stands:', JSON.stringify(stripScript(script)), '']
  lines.push(change ? change.ask : String(extra || 'Rewrite it better.').slice(0, 600))
  if (change && extra) lines.push(`The owner adds: "${String(extra).slice(0, 600)}".`)
  lines.push('Keep the same length unless the change says otherwise, keep the facts true, and return the JSON object only.')
  return lines.join('\n')
}

/**
 * Only the fields a script carries, in order, so a stored row and a model
 * reply compare alike. (Older rows carry an on_screen list and a "show"
 * camera direction on each line; both are dropped here, so nothing shows
 * them and a rewrite does not carry them forward. The owner asked for the
 * words alone.)
 */
export function stripScript(s) {
  const x = s || {}
  return {
    title: String(x.title || ''),
    why_now: String(x.why_now || ''),
    seconds: Number(x.seconds) || 0,
    hook: String(x.hook || ''),
    lines: (Array.isArray(x.lines) ? x.lines : []).map((l) => ({ say: String(typeof l === 'string' ? l : l?.say || '') })),
    caption: String(x.caption || ''),
    cta: String(x.cta || ''),
    film_it: String(x.film_it || ''),
  }
}

/**
 * The reply as a script, or null. Finds the JSON object in the text (the
 * model is asked for nothing else, but a fence or a sentence slips in),
 * coerces every field and insists on at least two spoken lines.
 */
export function parseScript(text) {
  const raw = String(text || '')
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let obj
  try {
    obj = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const lines = (Array.isArray(obj.lines) ? obj.lines : [])
    .map((l) => ({ say: String(typeof l === 'string' ? l : l?.say || '').trim() }))
    .filter((l) => l.say)
  if (lines.length < 2) return null
  const hook = String(obj.hook || '').trim() || lines[0].say
  const script = stripScript({
    ...obj,
    hook,
    lines,
    seconds: Number(obj.seconds) || secondsFor(lines),
  })
  // The hook is the first line; a hook that drifted from it is corrected to it.
  if (script.lines[0].say !== script.hook) script.hook = script.lines[0].say
  // No em dashes reach a client's screen.
  const clean = (s) => s.replace(/\s*[—–]\s*/g, ', ')
  script.title = clean(script.title)
  script.why_now = clean(script.why_now)
  script.hook = clean(script.hook)
  script.lines = script.lines.map((l) => ({ say: clean(l.say) }))
  script.caption = clean(script.caption)
  script.cta = clean(script.cta)
  script.film_it = clean(script.film_it)
  return script
}

/** The script as plain text, for Copy, Share and Print. */
export function scriptToText(script, { name = '' } = {}) {
  const s = stripScript(script)
  const out = [s.title.toUpperCase(), `About ${s.seconds || secondsFor(s.lines)} seconds${name ? ` · ${name}` : ''}`, '']
  s.lines.forEach((l, i) => out.push(`${i + 1}. ${l.say}`))
  if (s.film_it) out.push('', `Film it: ${s.film_it}`)
  if (s.caption) out.push('', 'Caption to post:', s.caption)
  return out.join('\n')
}

/** The ask as a short line for a list: "This month's offer · 30 seconds · in the truck". */
export function askLabel(ask = {}) {
  const parts = [topicLabel(ask.topic), lengthOf(ask.length).label]
  const setting = labelOf(SETTINGS, ask.setting, '')
  if (setting) parts.push(setting.toLowerCase())
  return parts.join(' · ')
}

/** A plain-English line about a client's scripts, for the CRM card. */
export function scriptsSummary(rows = []) {
  const n = rows.length
  if (!n) return 'No scripts yet. Send them the link and the first three picks are waiting.'
  const filmed = rows.filter((r) => r.status === 'filmed').length
  const aside = rows.filter((r) => r.status === 'archived').length
  const parts = [`${n} script${n === 1 ? '' : 's'}`]
  if (filmed) parts.push(`${filmed} filmed`)
  if (aside) parts.push(`${aside} set aside`)
  return parts.join(' · ')
}
