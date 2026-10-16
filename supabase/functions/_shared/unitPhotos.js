// Real photos of the equipment, the pure half.
//
// The ad templates stand a piece of equipment in the corner of an ad: a
// furnace, a condenser, a boiler, a water heater, a mini split, a
// thermostat. Drawn by hand on a canvas they never looked like the
// catalogue cutouts the best home-services ads use, so the stock-images
// Edge Function makes real ones with an image model (OpenAI's gpt-image-1,
// the model behind ChatGPT's pictures; Anthropic's models write words, not
// pictures): one photoreal product shot per unit on a transparent
// background, and a worn-out rusty twin of each for the trade-in ads. They
// live in the shared stock library at stock/units/<key>.png, made once for
// every client, and every template paints the photo in place of the
// drawing the moment it exists.
//
// Shared three ways, so plain JavaScript with no imports: the Edge Function
// (the prompts), the browser (the keys, the paths, the labels) and
// scripts/check-unit-photos.mjs.

/** The six units, the same keys as CUTOUTS in src/lib/adTemplateMeta.js. */
export const UNIT_KEYS = ['ac', 'furnace', 'boiler', 'water_heater', 'mini_split', 'thermostat']

export const OLD_PREFIX = 'old_'

/** Every photo the library can hold: a new and an old of each unit. */
export const UNIT_PHOTO_KEYS = [...UNIT_KEYS, ...UNIT_KEYS.map((k) => OLD_PREFIX + k)]

export const UNIT_PHOTO_PREFIX = 'stock/units/'

export const unitPhotoPath = (key) => `${UNIT_PHOTO_PREFIX}${key}.png`

const LABELS = { ac: 'AC unit', furnace: 'Furnace', boiler: 'Boiler', water_heater: 'Water heater', mini_split: 'Mini split', thermostat: 'Thermostat' }

export function unitPhotoLabel(key) {
  const k = String(key || '')
  const old = k.startsWith(OLD_PREFIX)
  const base = LABELS[old ? k.slice(OLD_PREFIX.length) : k] || k
  return old ? `Old ${base.toLowerCase()} (rusty, for trade-in ads)` : base
}

/** Which photos exist and which are missing, in library order. */
export function unitPhotoStatus(photos) {
  const have = UNIT_PHOTO_KEYS.filter((k) => photos && photos[k])
  const missing = UNIT_PHOTO_KEYS.filter((k) => !(photos && photos[k]))
  return { have, missing, total: UNIT_PHOTO_KEYS.length }
}

// The look every photo shares: a catalogue cutout, lit evenly, the unit
// alone on a transparent background with a soft shadow under it, nothing
// written on it (a brand name on a client's ad would be somebody else's).
const SHOT =
  'Photorealistic catalogue product photograph, three-quarter front view from slightly above, even soft studio lighting, crisp focus, true-to-life materials and reflections, a soft natural shadow directly under the base, the whole unit in frame with a little space around it, isolated on a plain transparent background, nothing else in the picture, no people, no room, no wall, no floor, no text, no logos, no brand names, no labels with words.'

const OLD =
  'It is twenty-five years old and worn out: rust streaks and corrosion along the seams and the base, flaking and faded paint, a few dents, dust and soot, dated design. Still clearly the same kind of unit, standing upright.'

/** What to ask the image model for, per photo. */
export const PROMPTS = {
  ac: `A modern residential central air conditioner outdoor condenser unit: a square light grey steel cabinet with louvered coil panels on the sides and a round black fan grille set into the top, a small service panel on one corner. ${SHOT}`,
  furnace: `A modern residential high-efficiency gas furnace: an upright rectangular steel cabinet, light grey with a darker charcoal upper access door, a small control panel and a narrow vent on the upper door, a plain lower blower door, a short grey supply duct stub on top and two white PVC vent pipes leaving the top. ${SHOT}`,
  boiler: `A residential cast-iron gas boiler: a compact floor-standing unit with a dark teal green steel jacket, a grey control box on top with a thin pipe into it, copper water pipes and a round white pressure gauge rising from the top, a black burner control box with a small red button on the lower front, a brushed steel badge plate with no writing. ${SHOT}`,
  water_heater: `A residential gas water heater: a tall white cylindrical tank with a grey domed top, a galvanized flue pipe and two copper water connections rising from the top, a small gas control valve with a dial near the base, a plain rating plate with no writing. ${SHOT}`,
  mini_split: `A ductless mini split indoor wall unit: a sleek white rounded unit as mounted high on a wall, seen from slightly below, the lower air vane open, a small dark display window at the right end. ${SHOT}`,
  thermostat: `A modern round smart thermostat: a brushed stainless steel ring around a black glass face that shows the temperature 72 in large white digits and a thin orange arc, seen straight on with a slight reflection on the glass. ${SHOT}`,
}
PROMPTS[`${OLD_PREFIX}ac`] = `An old residential central air conditioner outdoor condenser unit: a square steel cabinet with louvered coil panels and a round fan grille on top. ${OLD} ${SHOT}`
PROMPTS[`${OLD_PREFIX}furnace`] = `An old residential gas furnace: an upright rectangular steel cabinet, originally beige, with two access doors and a metal flue pipe on top. ${OLD} ${SHOT}`
PROMPTS[`${OLD_PREFIX}boiler`] = `An old residential cast-iron gas boiler: a squat floor-standing unit with a dark green steel jacket, a grey control box on top, corroded copper pipes and a cloudy pressure gauge, a black burner box at the lower front. ${OLD} ${SHOT}`
PROMPTS[`${OLD_PREFIX}water_heater`] = `An old residential gas water heater: a tall cylindrical tank, originally white, with a flue pipe and two water connections on top and a gas valve near the base. ${OLD} ${SHOT}`
PROMPTS[`${OLD_PREFIX}mini_split`] = `An old ductless mini split indoor wall unit: a yellowed white plastic unit as mounted on a wall, the air vane sagging open, a cracked display window. ${OLD} ${SHOT}`
PROMPTS[`${OLD_PREFIX}thermostat`] = `An old round mechanical wall thermostat: a yellowed beige plastic dial with a scratched clear cover and a faded temperature scale, seen straight on. ${OLD} ${SHOT}`
