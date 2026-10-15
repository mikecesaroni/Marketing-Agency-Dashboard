// Self-check for the template registry. Run: node scripts/check-ad-templates.mjs
//
// The painters need a canvas and are exercised in the browser; this covers the
// decisions around them: which templates exist, which theme and kicker a
// season gets, how the offer tiles fall back, and that every template is a
// layout the Studio, the help chat and the saved-ad recipe all know.

import { CUTOUTS, PHOTO_TEMPLATES, TEMPLATE_KEYS, TEMPLATE_LAYOUTS, TEMPLATE_SHAPES, THEME_KEYS, TWO_PHOTO_TEMPLATES, isLookKey, isTemplate, kickerFor, offersFor, offersToStore, seasonKicker, templateMenu, themeFor } from '../src/lib/adTemplateMeta.js'
import { FOCUS_LAYOUTS, LAYOUTS, PHOTO_LOOKS, TEXT_LAYOUTS } from '../src/lib/adLayout.js'
import { lookName } from '../src/lib/adBatch.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

// The registry.
check('sixteen templates', TEMPLATE_KEYS.length, 16)
check('every template has a key, a label and a hint', TEMPLATE_LAYOUTS.every((t) => t.key && t.label && t.hint), true)
check('keys are snake_case and unique', [TEMPLATE_KEYS.every((k) => /^[a-z][a-z0-9_]*$/.test(k)), new Set(TEMPLATE_KEYS).size], [true, 16])
check('no template key collides with a photo look', TEMPLATE_KEYS.filter((k) => PHOTO_LOOKS.some((l) => l.key === k)), [])
check('the photo templates', PHOTO_TEMPLATES, ['photo_sale', 'before_sale', 'reveal'])
check('the two-photo templates take the After picker', TWO_PHOTO_TEMPLATES, ['before_sale', 'reveal'])
check('isTemplate', [isTemplate('poster'), isTemplate('cover'), isTemplate(''), isTemplate(undefined)], [true, false, false, false])
check('the templates have names for the batch strip and the help chat', [lookName('massive_deal'), lookName('poster'), lookName('stack')], ['Massive deal', 'White poster', 'Headline stack'])

// The layout list the Studio reads.
check('LAYOUTS is the photo looks then the templates', LAYOUTS.map((l) => l.key), [...PHOTO_LOOKS.map((l) => l.key), ...TEMPLATE_KEYS])
check('the templates are grouped so the row and the gallery can split them', LAYOUTS.filter((l) => l.group === 'template').length, 16)
check('every template paints the words', TEMPLATE_KEYS.every((k) => TEXT_LAYOUTS.includes(k)), true)
check('dragging moves the photo on the photo templates only', TEMPLATE_KEYS.filter((k) => FOCUS_LAYOUTS.includes(k)), ['photo_sale', 'before_sale', 'reveal'])

// Themes.
check('nine themes', THEME_KEYS.length, 9)
check('a season has a theme', [themeFor({ season: 'winter' }), themeFor({ season: 'fall' }), themeFor({ season: 'summer' }), themeFor({ season: 'spring' }), themeFor({ season: 'holiday' })], ['snow', 'leaves', 'sun', 'fresh', 'holiday'])
check('no season means the brand colour', [themeFor({ season: 'all' }), themeFor({}), themeFor(null)], ['brand', 'brand', 'brand'])
check('a template with its own theme keeps it whatever the season', themeFor({ layout: 'winter_shout', season: 'summer' }), 'snow')
check('a picked theme wins over everything', themeFor({ layout: 'winter_shout', season: 'summer', theme: 'night' }), 'night')
check('an unknown theme is ignored', themeFor({ season: 'winter', theme: 'lava' }), 'snow')
check('the season sale follows the season', [themeFor({ layout: 'season_sale', season: 'summer' }), themeFor({ layout: 'season_sale', season: 'winter' })], ['sun', 'snow'])

// The kicker.
check('the season writes the kicker', [seasonKicker('fall'), seasonKicker('winter'), seasonKicker('summer'), seasonKicker('spring'), seasonKicker('holiday')], ['Fall Special', 'Winter Sale', 'Summer Sale', 'Spring Sale', 'Holiday Deals'])
check('no season shouts the deals', [seasonKicker('all'), seasonKicker(''), seasonKicker(undefined)], ['Massive Deals', 'Massive Deals', 'Massive Deals'])
check('a typed kicker wins', kickerFor({ kicker: '  Call now for ', season: 'fall' }), 'Call now for')
check('an empty kicker falls back', kickerFor({ kicker: '   ', season: 'fall' }), 'Fall Special')

// The offer tiles.
check('no offers and no main offer means no tiles', offersFor({}), [])
check('the main offer is the one tile', offersFor({ offerAmount: '$89', offerDetail: 'Furnace tune-up' }), [{ amount: '$89', detail: 'Furnace tune-up' }])
check('typed tiles replace the main offer', offersFor({ offerAmount: '$89', offers: [{ amount: '$0', detail: 'Down' }, { amount: '$79', detail: 'Tune-up' }] }), [{ amount: '$0', detail: 'Down' }, { amount: '$79', detail: 'Tune-up' }])
check('blank tiles are dropped and four is the most', offersFor({ offers: [{ amount: '', detail: ' ' }, { amount: '1' }, { amount: '2' }, { amount: '3' }, { amount: '4' }, { amount: '5' }] }).map((o) => o.amount), ['1', '2', '3', '4'])
check('junk offers are ignored', offersFor({ offers: 'nope', offerAmount: '$5' }), [{ amount: '$5', detail: '' }])
check('stored as null when empty', offersToStore([{ amount: '', detail: '' }]), null)
check('stored trimmed', offersToStore([{ amount: ' $89 ', detail: ' Tune-up ' }]), [{ amount: '$89', detail: 'Tune-up' }])

// The shapes the chat writes to.
check('every template says when it wins and what it needs', TEMPLATE_KEYS.every((k) => TEMPLATE_SHAPES[k]?.wins && TEMPLATE_SHAPES[k]?.needs), true)
check('the menu lists every template once', TEMPLATE_KEYS.every((k) => templateMenu().split('\n').filter((l) => l.startsWith(`- ${k} (`)).length === 1), true)
check('a look key is a template or a photo look', [isLookKey('plan_card'), isLookKey('stack'), isLookKey(' coupon '), isLookKey('card'), isLookKey(''), isLookKey(null)], [true, true, true, false, false, false])

// The equipment.
check('six built-in cutouts', CUTOUTS.map((c) => c.key), ['ac', 'furnace', 'boiler', 'water_heater', 'mini_split', 'thermostat'])

console.log(failures ? `\n${failures} check(s) failed` : '\nAll template checks pass')
process.exit(failures ? 1 : 0)
