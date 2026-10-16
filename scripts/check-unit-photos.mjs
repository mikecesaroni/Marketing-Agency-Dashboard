// Self-check for the real equipment photos. Run: node scripts/check-unit-photos.mjs
//
// The photos themselves come from an image model through the stock-images
// function and cannot be made here; this pins what the function and the
// browser agree on: the keys, the paths, the labels and what the prompts ask.

import { OLD_PREFIX, PROMPTS, UNIT_KEYS, UNIT_PHOTO_KEYS, unitPhotoLabel, unitPhotoPath, unitPhotoStatus } from '../supabase/functions/_shared/unitPhotos.js'
import { CUTOUTS } from '../src/lib/adTemplateMeta.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

check('the six units are the six built-in cutouts', UNIT_KEYS, CUTOUTS.map((c) => c.key))
check('twelve photos: a new and an old of each', [UNIT_PHOTO_KEYS.length, UNIT_PHOTO_KEYS.filter((k) => k.startsWith(OLD_PREFIX)).length], [12, 6])
check('every photo has a prompt', UNIT_PHOTO_KEYS.every((k) => typeof PROMPTS[k] === 'string' && PROMPTS[k].length > 80), true)
check('every prompt asks for a cutout: transparent background, no words, no brand names', UNIT_PHOTO_KEYS.every((k) => /transparent background/.test(PROMPTS[k]) && /no text/.test(PROMPTS[k]) && /no brand names/.test(PROMPTS[k]) && /no logos/.test(PROMPTS[k])), true)
check('the old ones are rusty and worn', UNIT_KEYS.every((k) => /rust/i.test(PROMPTS[OLD_PREFIX + k]) && /worn out/.test(PROMPTS[OLD_PREFIX + k])), true)
check('the new ones are not', UNIT_KEYS.every((k) => !/rust/i.test(PROMPTS[k])), true)
check('the boiler reads like the reference ad: teal jacket, control box, gauge', /teal/.test(PROMPTS.boiler) && /control box/.test(PROMPTS.boiler) && /gauge/.test(PROMPTS.boiler), true)
check('paths live under stock/units', [unitPhotoPath('boiler'), unitPhotoPath('old_boiler')], ['stock/units/boiler.png', 'stock/units/old_boiler.png'])
check('labels', [unitPhotoLabel('boiler'), unitPhotoLabel('old_boiler'), unitPhotoLabel('water_heater')], ['Boiler', 'Old boiler (rusty, for trade-in ads)', 'Water heater'])
check('the status counts what is there, in library order', unitPhotoStatus({ old_ac: {}, boiler: {} }), {
  have: ['boiler', 'old_ac'],
  missing: ['ac', 'furnace', 'water_heater', 'mini_split', 'thermostat', 'old_furnace', 'old_boiler', 'old_water_heater', 'old_mini_split', 'old_thermostat'],
  total: 12,
})
check('an empty library', unitPhotoStatus(null).have, [])

console.log(failures ? `\n${failures} check(s) failed` : '\nAll unit photo checks pass')
process.exit(failures ? 1 : 0)
