// Self-check for the Video Script Studio's pure half: the picks, the
// "what is working" lines, the brief, the ask and the parser.
// Run: node scripts/check-script-studio.mjs

import {
  CHANGES,
  DAILY_LIMIT,
  LENGTHS,
  TOPICS,
  aggregateAds,
  askLabel,
  buildScriptBrief,
  hookFromAdName,
  ideasFor,
  parseScript,
  reviseAsk,
  scriptAsk,
  scriptToText,
  HOW_TO_RECORD,
  scriptsSummary,
  secondsFor,
  voiceBlock,
  workingLines,
} from '../supabase/functions/_shared/scriptStudio.js'
import { phaseOf, playbookText } from '../src/lib/seasonPlaybook.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// ------------------------------------------------------------- the menus
check('ten topics, three lengths, six one-tap changes', [TOPICS.length, LENGTHS.length, CHANGES.length], [10, 3, 6])
check('no em dashes in anything a client taps', /[—–]/.test(JSON.stringify([TOPICS, LENGTHS, CHANGES])), false)
check('a daily wall exists', DAILY_LIMIT >= 20, true)

// ------------------------------------------------------ what is working
const rows = [
  { ad_id: 'a1', ad_name: 'WC_Fall | 2026-09-20 | Furnace tune-up', spend: 270, leads: 9 },
  { ad_id: 'a1', ad_name: 'WC_Fall | 2026-09-20 | Furnace tune-up', spend: 30, leads: 1 },
  { ad_id: 'a2', ad_name: 'WC_Year-round | 2026-09-01 | Meet the owner', spend: 250, leads: 0 },
  { ad_id: 'g1', ad_name: 'WC_Search', spend: 240, leads: 4 },
]
const ads = aggregateAds(rows)
check('ads add up by ad and sort by leads', ads.map((a) => [a.name.split('|').pop().trim(), a.leads, a.spend]), [['Furnace tune-up', 10, 300], ['WC_Search', 4, 240], ['Meet the owner', 0, 250]])
check('the hook is the last part of a WC name', [hookFromAdName('WC_Fall | 2026-09-20 | Furnace tune-up'), hookFromAdName('WC_Search'), hookFromAdName('')], ['Furnace tune-up', 'Search', ''])
const working = workingLines({ ads, weeks: [{ week_start: '2026-09-28', jobs_booked: 3, revenue: 9000 }, { week_start: '2026-09-21', jobs_booked: null }] })
check('a plain line per ad with leads, cost each, and the jobs line', working.map((w) => w.text), [
  'Your “Furnace tune-up” ad brought 10 leads in the last 90 days, about $30 each.',
  'Your “Search” ad brought 4 leads in the last 90 days, about $60 each.',
  'You told us 3 jobs were booked from the ads over 1 week, worth about $9,000.',
])
check('no leads yet reads as a promise, not a blank', workingLines({ ads: [{ name: 'x', leads: 0, spend: 10 }] }).map((w) => w.kind), ['none'])
check('nothing running, nothing said', workingLines({}), [])

// ---------------------------------------------------------------- the picks
const phase = phaseOf({ industry: 'HVAC', market: 'Manchester, NH', today: new Date('2026-10-16') })
const ideas = ideasFor({ phase, working, has: { reviews: '4.9 stars from 312 reviews' } })
check('three picks: the season, what is working, the proof', ideas.map((i) => i.topic), ['season', 'problem', 'review'])
check('the season pick is the phase’s lead hook with the month', [ideas[0].title, /It is October/.test(ideas[0].why)], [phase.hooks[0], true])
check('the working pick names the ad', /Furnace tune-up/.test(ideas[1].title), true)
check('topics used this week move the picks on', ideasFor({ phase, working, has: { reviews: '4.9' }, used: ['season', 'review'] }).map((i) => i.topic), ['problem', 'owner', 'emergency'])
check('nothing known still gives three', ideasFor({}).map((i) => i.topic), ['owner', 'tip', 'faq'])
check('never two picks of one topic', new Set(ideas.map((i) => i.topic)).size, 3)

// ---------------------------------------------------------------- the brief
const facts = {
  name: 'Prime Heating & Cooling',
  industry: 'HVAC',
  market: 'Manchester, NH',
  intake: { business_name: 'Prime Heating & Cooling', owner_name: 'Ethan', target_cities: 'Manchester, Nashua', reviews_star_rating: '4.9', reviews_count: '312', phone_for_ads: '603-555-0100', cta_offering: '$89 furnace tune-up', financing_available: true, words_to_avoid: 'cheap', meta_ad_budget_per_day: 50, call_notes: 'secret agency notes' },
  website: 'Family-owned since 2011. Furnace and AC installs, repairs, tune-ups.',
  working,
  usedHooks: ['Be ready for winter'],
  recentScripts: ['Meet the owner'],
  transcripts: ['Hey folks, Ethan here from Prime. Quick one today about your furnace filter.'],
  voice: { goes_by: 'Ethan', person: 'i', tone: 'friendly', avoid: 'cheap, deal', sign_off: 'Stay warm out there.' },
}
const playbook = playbookText(phase, { tradeWords: 'heating and cooling', market: 'Manchester, NH' })
const brief = buildScriptBrief(facts, { playbook, today: new Date('2026-10-16') })
check('the brief is the owner talking in the first person', /The owner, Ethan, reads your script/.test(brief) && /first person/.test(brief), true)
check('the facts are in: towns, reviews, phone, offer, financing', ['Manchester, Nashua', '4.9 stars, 312 reviews', '603-555-0100', '$89 furnace tune-up', 'Financing: yes'].every((s) => brief.includes(s)), true)
check('what is working and the hooks to avoid are in', /Furnace tune-up” ad brought 10 leads/.test(brief) && /do not open with these\): Be ready for winter/.test(brief) && /do not repeat these\): Meet the owner/.test(brief), true)
check('how they talk is in, with their own words', /goes by Ethan/.test(brief) && /Stay warm out there/.test(brief) && /Ethan here from Prime/.test(brief), true)
check('the season is in', /It is October/.test(brief), true)
check('the website fact sheet is in', /Family-owned since 2011/.test(brief), true)
check('the rules: no ID numbers, no brackets, no em dashes, the pace', [/Never a licence/.test(brief), /No brackets/.test(brief), /No em dashes/.test(brief), /2.5 words a second/.test(brief)], [true, true, true, true])
check('the output is one JSON object with the fields the page reads', ['"title"', '"why_now"', '"seconds"', '"hook"', '"lines"', '"say"', '"caption"', '"cta"', '"film_it"'].every((k) => brief.includes(k)) && !brief.includes('"show"'), true)
check('no on-screen words asked for: the owner just talks', !brief.includes('"on_screen"') && /No on-screen text/.test(brief), true)
check('nothing the client should not see', /secret agency notes|meta_ad_budget|50\/day/.test(brief), false)
check('the voice block alone reads', /Tone: friendly neighbour/.test(voiceBlock(facts.voice)), true)

// ------------------------------------------------------------------ the ask
const ask = scriptAsk({ topic: 'season', length: '30', speaker: 'owner', setting: 'truck', tone: 'straight', extra: 'mention we are open Saturdays', idea: ideas[0] })
check('the ask names the length in seconds and words', /30-second video script \(about 75 spoken words\)/.test(ask), true)
check('the pick, the topic, who, where, tone and the extra are in', [new RegExp(`It is this one: "${ideas[0].title}"`).test(ask), /this month’s offer/.test(ask), /just me, talking to the camera/.test(ask), /Filmed in the truck/.test(ask), /Tone: straight talk/.test(ask), /open Saturdays/.test(ask)], [true, true, true, true, true, true])
check('a voiceover ask says the owner is heard, not seen', /heard, not seen/.test(scriptAsk({ speaker: 'voiceover' })), true)
check('a two-person ask marks the tech’s lines', /"Tech: \.\.\."/.test(scriptAsk({ speaker: 'tech' })), true)
check('unknown taps fall back', /15-second/.test(scriptAsk({ length: '15', topic: 'zzz' })) && /this month’s offer/.test(scriptAsk({ topic: 'zzz' })), true)

// --------------------------------------------------------------- the parser
const reply = `Here you go:\n\`\`\`json\n{"title":"Furnace tune-up before the freeze","why_now":"October is tune-up month","seconds":30,"hook":"Your furnace has not run since March.","lines":[{"say":"Your furnace has not run since March.","show":"You at the truck"},{"say":"Eighty-nine dollars, we check it top to bottom — before the first cold night.","show":"The furnace"},{"say":"Call 603-555-0100.","show":"The number on screen"}],"on_screen":["$89 tune-up","Before the freeze"],"caption":"$89 furnace tune-up in Manchester. Call 603-555-0100. #hvac #manchesternh","cta":"Call us today.","film_it":"Stand by the truck in daylight, phone upright."}\n\`\`\``
const script = parseScript(reply)
check('the JSON is found inside the fence and the words around it', script?.title, 'Furnace tune-up before the freeze')
check('three lines, the words only (camera directions dropped)', script.lines.map((l) => [l.say.length > 0, 'show' in l]), [[true, false], [true, false], [true, false]])
check('an em dash never reaches the client', /[—–]/.test(JSON.stringify(script)), false)
check('the hook is the first line', script.hook, script.lines[0].say)
check('seconds and the caption come through', [script.seconds, /#hvac/.test(script.caption)], [30, true])
check('junk is null, one line is null', [parseScript('no json here'), parseScript('{"title":"x","lines":[{"say":"only one"}]}')], [null, null])
check('string lines are coerced and an old on_screen list is dropped', (() => {
  const p = parseScript('{"lines":["Hello there neighbours.","Call us."],"on_screen":["Call today"]}')
  return [p.lines.length, 'on_screen' in p]
})(), [2, false])
check('seconds are counted when missing', parseScript('{"lines":[{"say":"one two three four five"},{"say":"six seven eight nine ten"}]}').seconds, 4)
check('the reading time adds the spoken words at 2.5 a second', secondsFor([{ say: 'one two three four five six seven eight nine ten' }, { say: 'eleven twelve thirteen fourteen fifteen' }]), 6)

// ------------------------------------------------------------- the changes
const rev = reviseAsk(script, 'shorter', 'keep the phone number')
check('a change carries the script and the instruction', /Furnace tune-up before the freeze/.test(rev) && /Make it shorter/.test(rev) && /keep the phone number/.test(rev), true)
check('an unknown change with words uses the words', /Rewrite it in Spanish/.test(reviseAsk(script, 'nope', 'Rewrite it in Spanish')), true)

// ---------------------------------------------------------------- the text
const text = scriptToText(script, { name: 'Prime' })
check('plain text for copy and share', text.startsWith('FURNACE TUNE-UP BEFORE THE FREEZE\nAbout 30 seconds · Prime') && /1\. Your furnace has not run since March\.\n2\. Eighty-nine dollars/.test(text) && !/Show:/.test(text) && /Caption to post:/.test(text) && !/On screen/.test(text), true)
check('the copied text ends with how to record, the same eight lines the page shows', text.endsWith(['HOW TO RECORD', ...HOW_TO_RECORD.map((t) => `• ${t}`)].join('\n')) && HOW_TO_RECORD.length === 8, true)
check('the tips say to hold the phone, and to stand by the truck or the system', [HOW_TO_RECORD[0].startsWith('Hold the phone yourself'), HOW_TO_RECORD[1].startsWith('Stand in front of your branded truck')], [true, true])
check('the tips come after the caption, so the script reads first', text.indexOf('Caption to post:') < text.indexOf('HOW TO RECORD'), true)
check('the ask as a line', askLabel({ topic: 'season', length: '30', setting: 'truck' }), 'This month’s offer · 30 seconds · in the truck')
check('the CRM summary', [scriptsSummary([]), scriptsSummary([{ status: 'filmed' }, { status: 'archived' }, { status: 'new' }])], ['No scripts yet. Send them the link and the first three picks are waiting.', '3 scripts · 1 filmed · 1 set aside'])

console.log(failures ? `\n${failures} check(s) failed` : '\nAll script studio checks pass')
process.exit(failures ? 1 : 0)
