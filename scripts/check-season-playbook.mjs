// Self-check for the season playbook. Run: node scripts/check-season-playbook.mjs
//
// The phases by trade, climate and month; the template pick from the words
// and the photos; the batch's looks from the playbook.

import { bestTemplates, phaseOf, pickTemplate, playbookText } from '../src/lib/seasonPlaybook.js'
import { chooseLooks } from '../src/lib/adBatch.js'
import { TEMPLATE_KEYS } from '../src/lib/adTemplateMeta.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const at = (m) => new Date(2026, m - 1, 15)
const hvac = (m, market = 'Manchester, NH') => phaseOf({ industry: 'HVAC', market, today: at(m) })

// HVAC in a cold market: two peaks, two shoulders, the holidays.
check('January is peak heating', hvac(1).key, 'heating_peak')
check('March is the spring shoulder', hvac(3).key, 'spring_shoulder')
check('May is early cooling', hvac(5).key, 'cooling_ramp')
check('July is peak cooling', hvac(7).key, 'cooling_peak')
check('October is the fall shoulder', hvac(10).key, 'fall_shoulder')
check('December is the holidays', hvac(12).key, 'holiday')
// Hot markets: no heating peak, a long cooling season, a break in the fall.
check('Fort Myers in January is the off-season', hvac(1, 'Fort Myers, FL').key, 'cool_offseason')
check('Fort Myers in September is still peak cooling', hvac(9, 'Fort Myers, FL').key, 'cooling_peak')
check('Fort Myers in October is the break', hvac(10, 'Fort Myers, FL').key, 'hot_break')
// What a phase carries.
const fall = hvac(10)
check('the fall shoulder sells the tune-up first', fall.templates[0].key, 'tune_up')
check('a furnace stands in the corner in the fall', [fall.cutout, fall.theme, fall.kicker, fall.season], ['furnace', 'leaves', 'Fall Special', 'fall'])
check('peak cooling leads with the emergency call and an AC unit', [hvac(7).templates[0].key, hvac(7).cutout, hvac(7).theme], ['emergency', 'ac', 'sun'])
check('every phase template exists', TEMPLATE_KEYS.length > 0 && [1, 3, 5, 7, 10, 12].every((m) => hvac(m).templates.every((t) => TEMPLATE_KEYS.includes(t.key))), true)
check('the fall shoulder says what to leave out', fall.avoid.some((a) => /emergency/i.test(a)), true)
check('the playbook text names the month, the trade and the market', /October.*fall shoulder.*heating and cooling.*Manchester/i.test(playbookText(fall, { tradeWords: 'heating and cooling', market: 'Manchester, NH' }).replace(/\n/g, ' ')), true)

// Plumbing: the freeze and the week after Thanksgiving.
const plumb = (m) => phaseOf({ industry: 'Plumbing', market: 'Boston, MA', today: at(m) })
check('January plumbing is the freeze', [plumb(1).key, plumb(1).cutout], ['freeze', 'water_heater'])
check('November plumbing is the holiday week', [plumb(11).key, plumb(11).templates[0].key], ['holiday', 'holiday_deals'])
check('April plumbing is sump pumps and flushes', plumb(4).key, 'spring')
// A combined trade carries both.
const both = phaseOf({ industry: 'HVAC & Plumbing', market: 'Boston, MA', today: at(10) })
check('HVAC and plumbing: the HVAC phase with the plumbing side added', [both.key, both.tactics.some((t) => /plumbing side/i.test(t))], ['fall_shoulder', true])
// Other trades fall back to the season with their own tweaks.
const roof = phaseOf({ industry: 'Roofing', market: 'Denver, CO', today: at(4) })
check('roofing in April: storm inspections, before and after first', [roof.key, roof.templates[0].key, roof.cutout], ['spring', 'before_sale', ''])
const lawn = phaseOf({ industry: 'Lawn care', market: 'Columbus, OH', today: at(7) })
check('lawn in July: the weekly plan', [lawn.key, lawn.templates[0].key], ['summer', 'plan_card'])
const elec = phaseOf({ industry: 'Electrical', market: 'Columbus, OH', today: at(9) })
check('electrical in September: fall, a generator before winter in the tactics', [elec.key, elec.tactics.some((t) => /generator/i.test(t))], ['fall', true])
check('an unknown trade still gets a phase', phaseOf({ industry: '', market: '', today: at(6) }).key, 'summer')

// Picking a template from the words.
const pick = (content, extra = {}) => pickTemplate({ phase: fall, content, ...extra }).key
check('the phase default with no words', pick({}), 'tune_up')
check('financing words pick the financing template', pick({ hook: 'Stop patching it', offerAmount: '$0 down', offerDetail: '0% for 18 months' }), 'financing')
check('an emergency picks the emergency template', pick({ hook: 'No heat? Same-day repair' }), 'emergency')
check('a plan picks the plan card', pick({ hook: 'Join the Comfort Club', subhead: 'Two tune-ups a year, priority service, 15% off repairs' }), 'plan_card')
check('two prices pick the grid', pick({ offers: [{ amount: '$89', detail: 'Tune-up' }, { amount: '$0', detail: 'Down' }] }), 'price_grid')
check('a pair of photos picks a before and after', pick({ hook: 'See the difference' }, { hasPhoto: true, hasAfter: true }), 'before_sale')
check('never a photo template without a photo', TEMPLATE_KEYS.every((k) => pickTemplate({ phase: fall, content: { hook: 'x' }, hasPhoto: false }).ranked.find((r) => r.key === 'photo_sale').score < 0), true)
check('a template can be excluded', pick({ hook: 'No heat? Same-day repair' }, { exclude: ['emergency'] }) !== 'emergency', true)
check('the pick carries a reason', pickTemplate({ phase: fall, content: { hook: 'No heat? Same-day repair' } }).reason, 'the words are an emergency or same-day call')
check('the holidays lean to the holiday template', pickTemplate({ phase: hvac(12), content: {} }).key, 'holiday_deals')

// The best templates for the moment, minus the ones with no photo to use.
check('best templates skip the pair when there is no after photo', bestTemplates(fall, { hasPhoto: true, hasAfter: false }).map((t) => t.key), ['tune_up', 'fall_special', 'price_grid', 'coupon'])
check('a pair of photos brings the before and after in', bestTemplates(fall, { hasPhoto: true, hasAfter: true, count: 7 }).map((t) => t.key).includes('before_sale'), true)

// The batch's looks: one template each, the proof ad on the owner's photo.
const sets = [
  { hookAngle: 'the current offer', hook: 'Stop patching it', offerAmount: '$0 down', offerDetail: '0% for 18 months' },
  { hookAngle: 'the time of year', hook: 'Be ready for winter', offerAmount: '$89', offerDetail: 'Furnace tune-up' },
  { hookAngle: 'proof and trust', hook: '312 families chose us this year', proof: '4.9 stars' },
]
const chosen = chooseLooks(sets, { phase: fall, hasPhoto: true }).map((s) => s.layout)
check('the offer ad is the financing template, the season ad the tune-up, the proof ad the owner photo', chosen, ['financing', 'tune_up', 'stack'])
check('no template twice', new Set(chosen).size, 3)
check('without a photo the proof ad gets a template too', chooseLooks(sets, { phase: fall, hasPhoto: false }).map((s) => s.layout).every((k) => k !== 'stack'), true)
check('a set that names a look keeps it', chooseLooks([{ layout: 'cover' }], { phase: fall })[0].layout, 'cover')
check("the chat's own pick wins when it is real and fits", chooseLooks([{ hook: 'Join the club', suggestedLayout: 'coupon' }], { phase: fall, hasPhoto: false })[0].layout, 'coupon')
check("the chat's pick of a photo template without a photo is overruled", chooseLooks([{ hook: 'Our crew', suggestedLayout: 'photo_sale' }], { phase: fall, hasPhoto: false })[0].layout !== 'photo_sale', true)
check("the chat's pick is not used twice", chooseLooks([{ hook: 'a', suggestedLayout: 'coupon' }, { hook: 'b', suggestedLayout: 'coupon' }], { phase: fall })[1].layout !== 'coupon', true)
check('a before-and-after pick is left to the finder', chooseLooks([{ hook: 'See the change', suggestedLayout: 'before_sale' }], { phase: fall, hasPhoto: true })[0].layout !== 'before_sale', true)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll season playbook checks pass')
process.exit(failures ? 1 : 0)
