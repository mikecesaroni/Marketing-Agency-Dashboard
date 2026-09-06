// Self-check for the artboard warnings. Run: node scripts/check-creative-checks.mjs
//
// The rule: A WARNING NAMES A PATTERN THAT LOST MONEY IN THIS ACCOUNT, AND
// NOTHING ELSE. So the fixtures are the real ads: the ones that failed must
// warn, the ones that won must pass clean, and a tripwire PRICE (which the
// playbook says to show) must never be mistaken for a weak discount.

import { creativeWarnings } from '../src/lib/creativeChecks.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}
const codes = (content, opts) => creativeWarnings(content, opts).map((w) => w.code)

// --- winners pass clean ------------------------------------------------------

check(
  'Reliable $2,500 off: the account winner, no warnings',
  codes({
    hook: 'Your Neighbors Are Replacing, Not Repairing',
    offerAmount: '$2,500',
    offerDetail: 'OFF A NEW SYSTEM',
    subhead: 'Install in 48 hours, financing on the spot.',
    proof: '★ 4.9 on Google · 1,200 reviews',
  }),
  []
)
check(
  'Belk owner hook, 5.88% CTR: clean',
  codes({
    hook: 'You Deal With The Owner, Not A Call Center',
    offerAmount: '$500',
    offerDetail: 'OFF ANY NEW AC INSTALL',
    subhead: 'Price up front. No pressure, no upsell, no surprise line items.',
    proof: '★ 5.0 on Google · 57 reviews',
  }),
  []
)
check(
  'a free give-away is not a discount',
  codes({
    hook: 'Hard Water Is Coating Your Skin',
    offerAmount: '$1,200',
    offerDetail: 'TANKLESS RO UPGRADE, YOURS FREE',
    subhead: 'The film builds up faster than soap removes it.',
    proof: 'Owner run, lifetime valve warranty',
  }),
  []
)
check(
  'a tripwire price is a price, not a weak discount',
  codes({ hook: 'Furnace Tune-Up Before The Cold', offerAmount: '$29.95', offerDetail: '15-POINT INSPECTION', proof: '4.8 stars' }),
  []
)
check(
  'a big percent-off passes',
  codes({ hook: 'New Windows For Half', offerAmount: '50% off', offerDetail: 'INSTALLATION', proof: '4.8 stars' }),
  []
)

// --- losers warn -------------------------------------------------------------

check(
  '$50 off repairs: weak offer',
  codes({ hook: 'AC Repair Without The Surprise Bill', offerAmount: '$50', offerDetail: 'OFF REPAIRS OVER $300', proof: '5.0 stars' }),
  ['weak_offer']
)
check(
  '$100 off a furnace ($78 a lead): weak offer',
  codes({ hook: 'New Furnace, Installed This Week', offerAmount: '$100', offerDetail: 'OFF NEW FURNACE', proof: '4.9 stars' }),
  ['weak_offer']
)
check(
  '10% off: weak offer',
  codes({ hook: 'Repipe Season', offerAmount: '10% off', offerDetail: 'REPIPES', proof: '4.9 stars' }),
  ['weak_offer']
)
check(
  '"3 Signs" fear hook on an image',
  codes({
    hook: "3 Signs Your AC Won't Survive Next Summer",
    offerAmount: 'Free',
    offerDetail: 'HONEST SYSTEM CHECK',
    subhead: 'Weak airflow, warm vents, rising bills.',
    proof: '5.0 stars',
  }),
  ['fear_static']
)
check(
  '"Stop Paying To Patch A Dying AC": fear hook',
  codes({ hook: 'Stop Paying To Patch A Dying AC', offerAmount: '$500', offerDetail: 'OFF ANY NEW INSTALL', proof: '5.0' }),
  ['fear_static']
)
check(
  'a question hook is a problem hook',
  codes({ hook: 'Is Your Furnace Ready For Winter?', offerAmount: '$500', offerDetail: 'OFF INSTALLS', proof: '5.0' }),
  ['fear_static']
)
check(
  '"designs" is not "signs"',
  codes({ hook: 'Kitchen Designs Built Around You', offerAmount: '$500', offerDetail: 'OFF CABINETS', proof: '5.0' }),
  []
)
check(
  'empty proof warns',
  codes({ hook: 'A Monthly Cost, Not A Lump Sum', offerAmount: '$500', offerDetail: 'OFF ANY NEW AC or FURNACE INSTALLATION', proof: '' }),
  ['no_proof']
)
check(
  'eleven words is too long',
  codes({ hook: 'We Fix The Air Conditioner That Your Last Guy Could Not', offerAmount: '$500', offerDetail: 'OFF', proof: '5.0' }),
  ['long_hook']
)
check(
  'a subhead that restates the hook',
  codes({ hook: 'Free Furnace Tune-Up This Month', subhead: 'Get your furnace tune-up free this month.', offerAmount: 'Free', offerDetail: 'TUNE-UP', proof: '5.0' }),
  ['subhead_restates']
)
check(
  'several problems at once, in layout order',
  codes({ hook: 'Cost Of Waiting On That Leak?', offerAmount: '$50', offerDetail: 'OFF', proof: '' }),
  ['weak_offer', 'fear_static', 'no_proof']
)

// --- video has no artboard -----------------------------------------------------

check(
  'a video only gets the offer rule',
  codes({ hook: '3 Signs Your AC Is Dying', offerAmount: '$50', offerDetail: 'OFF', proof: '' }, { medium: 'video' }),
  ['weak_offer']
)
check('a clean video is clean', codes({ offerAmount: '$2,500', offerDetail: 'OFF' }, { medium: 'video' }), [])

// --- the text is a sentence someone can act on ----------------------------------

const w = creativeWarnings({ hook: 'x', offerAmount: '$50', offerDetail: 'OFF', proof: '' })
check('each warning carries text', w.every((x) => typeof x.text === 'string' && x.text.length > 40), true)
check('the weak offer text names the amount', /\$50 discount/.test(w[0].text), true)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll creative checks pass')
process.exit(failures ? 1 : 0)
