// Self-check for the Meta knowledge base. Run: node scripts/check-meta-knowledge.mjs
//
// The rule: THE LOAD-BEARING NUMBERS AND SECTIONS MUST BE PRESENT. This text
// is pasted into every AI prompt in the CRM, so an edit that drops the
// learning-phase rule or the fatigue thresholds silently makes every answer
// worse. Each check names one thing the AI must never lose.

import { META_KNOWLEDGE, KNOWLEDGE_UPDATED } from '../src/lib/metaKnowledge.js'

let failures = 0
function check(name, ok) {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
}
const has = (re) => re.test(META_KNOWLEDGE)

check('dated', /^\d{4}-\d{2}-\d{2}$/.test(KNOWLEDGE_UPDATED) && META_KNOWLEDGE.includes(KNOWLEDGE_UPDATED))
check('tags are explained', has(/\[meta\]/) && has(/\[industry\]/) && has(/\[ours\]/))
check('ours wins over industry, stated', has(/\[ours\]\s*\n?wins/i) || has(/\[ours\][^.]*wins/))

// Sections, in order.
const sections = [
  'HOW DELIVERY WORKS NOW',
  'THE LEARNING PHASE',
  'ACCOUNT STRUCTURE FOR A LOCAL TRADE',
  'CREATIVE: WHAT THE MACHINE REWARDS',
  'FATIGUE',
  'LEAD FORMS AND LEAD QUALITY',
  'BLUE-COLLAR MARKET FACTS',
  'DIAGNOSIS ORDER',
  'GUARDRAILS',
]
let last = -1
for (const s of sections) {
  const at = META_KNOWLEDGE.indexOf(s)
  check(`section "${s}" present and in order`, at > last)
  last = at
}

// Load-bearing facts.
check('Andromeda retrieves by creative', has(/Andromeda/) && has(/BY THE CREATIVE/))
check('the 25-creatives-in-one-ad-set test', has(/25 diverse creatives/))
check('total value formula', has(/bid x estimated action rate x ad\s*\n?quality/i))
check('relevance diagnostics triage', has(/Quality, Engagement Rate,\s*\n?Conversion Rate/))
check('50 events in 7 days', has(/50 optimisation events[\s\S]{0,40}7 days/))
check('learning budget floor formula', has(/50 x target CPL \/ 7/))
check('what resets learning', has(/budget changes over\s*\n?about 20%/) && has(/adding or removing\s*\n?ads/))
check('radius and audience size', has(/15 to 30 miles/) && has(/200,000 to 500,000/))
check('creative count at launch', has(/3 to 5 distinct angles/))
check('video vs image, ours', has(/Video \$37 per lead/) && has(/image \$53/))
check('sound off', has(/80 to 85% of video plays are muted/))
check('retention benchmarks', has(/ThruPlay[\s\S]{0,30}18 to 28%/))
check('fear hooks on stills, ours', has(/Problem-Question Hook B/))
check('offer size, ours', has(/\$2,500 OFF/) && has(/under \$250/))
check('fatigue thresholds', has(/CTR falls 15 to 20%/) && has(/past about 2\.5/) && has(/falls off past\s*\n?4\.0/))
check('CTR vs CPM attribution', has(/CTR down with CPM flat is the creative/))
check('higher intent forms', has(/Higher Intent/) && has(/30 to 40%/))
check('privacy policy required', has(/privacy policy URL is REQUIRED/))
check('feed booked jobs back', has(/Conversions API or offline event upload/))
check('speed to lead', has(/inside 5 minutes/))
check('HVAC CPL benchmarks', has(/HVAC overall \$45 to \$116/))
check('seasonality by trade', has(/furnace push September to November/) && has(/burst pipes December to February/))
check('diagnosis order has six steps', (META_KNOWLEDGE.match(/^\d\. /gm) || []).length >= 6)
check('never raise budget past 25%', has(/Never raise a budget more than 20 to 25%/))
check('learnings win when they contradict', has(/learnings[\s\S]{0,60}are newer and win/))

check('not bloated: under 16,000 characters', META_KNOWLEDGE.length < 16000)
check('no em dashes', !/—/.test(META_KNOWLEDGE))

console.log(failures ? `\n${failures} check(s) failed` : '\nAll knowledge checks pass')
process.exit(failures ? 1 : 0)
