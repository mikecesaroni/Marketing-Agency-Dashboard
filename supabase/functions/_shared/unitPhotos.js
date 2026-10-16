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
  'Ultra-realistic commercial catalogue hero product photograph, shot on a full-frame camera with an 85mm lens, three-quarter front view from slightly above, professional showroom lighting from large softboxes, crisp focus edge to edge, true-to-life materials: painted steel with subtle specular highlights and soft reflections of the softbox, polished copper, brushed metal; a soft natural contact shadow directly under the base, the whole unit in frame with a little space around it, isolated on a plain transparent background, nothing else in the picture, no people, no room, no wall, no floor, no text, no logos, no brand names, no labels with words.'

// The new units are brand new: out of the crate, spotless, gleaming.
const NEW = 'Brand new and factory fresh, straight out of the crate: immaculate, spotless, glossy surfaces with crisp panel seams, not a scratch, not a speck of dust.'

const OLD =
  'It is twenty-five years old and worn out: rust streaks and corrosion along the seams and the base, flaking and faded paint, a few dents, dust and soot, dated design. Still clearly the same kind of unit, standing upright.'

/** What to ask the image model for, per photo. */
export const PROMPTS = {
  ac: `A modern residential central air conditioner outdoor condenser unit: a square light grey steel cabinet with louvered coil panels on the sides and a round black fan grille set into the top, a small service panel on one corner. ${NEW} ${SHOT}`,
  furnace: `A modern residential high-efficiency gas furnace: a tall upright cabinet in glossy light grey powder-coated steel with a darker graphite upper access door, a small backlit digital control display and a narrow louvered vent on the upper door, a plain lower blower door with a flush handle, a clean galvanized supply duct collar on top and two clean white PVC vent pipes leaving the top. ${NEW} ${SHOT}`,
  boiler: `A residential cast-iron gas boiler: a compact floor-standing unit in a glossy deep teal-green powder-coated steel jacket, a grey control box on top with a thin pipe into it, gleaming polished copper water pipes with a brass fitting and a round white pressure gauge rising from the top, a black burner control module with a small red button on the lower front, a brushed stainless badge plate with no writing. ${NEW} ${SHOT}`,
  water_heater: `A residential gas water heater: a tall white cylindrical tank with a grey domed top, a galvanized flue pipe and two polished copper water connections rising from the top, a small gas control valve with a dial near the base, a plain rating plate with no writing. ${NEW} ${SHOT}`,
  mini_split: `A ductless mini split indoor wall unit: a sleek white rounded unit as mounted high on a wall, seen from slightly below, the lower air vane open, a small dark display window at the right end. ${NEW} ${SHOT}`,
  thermostat: `A modern round smart thermostat: a brushed stainless steel ring around a black glass face that shows the temperature 72 in large white digits and a thin orange arc, seen straight on with a slight reflection on the glass. ${NEW} ${SHOT}`,
}
PROMPTS[`${OLD_PREFIX}ac`] = `An old residential central air conditioner outdoor condenser unit: a square steel cabinet with louvered coil panels and a round fan grille on top. ${OLD} ${SHOT}`
PROMPTS[`${OLD_PREFIX}furnace`] = `An old residential gas furnace: an upright rectangular steel cabinet, originally beige, with two access doors and a metal flue pipe on top. ${OLD} ${SHOT}`
PROMPTS[`${OLD_PREFIX}boiler`] = `An old residential cast-iron gas boiler: a squat floor-standing unit with a dark green steel jacket, a grey control box on top, corroded copper pipes and a cloudy pressure gauge, a black burner box at the lower front. ${OLD} ${SHOT}`
PROMPTS[`${OLD_PREFIX}water_heater`] = `An old residential gas water heater: a tall cylindrical tank, originally white, with a flue pipe and two water connections on top and a gas valve near the base. ${OLD} ${SHOT}`
PROMPTS[`${OLD_PREFIX}mini_split`] = `An old ductless mini split indoor wall unit: a yellowed white plastic unit as mounted on a wall, the air vane sagging open, a cracked display window. ${OLD} ${SHOT}`
PROMPTS[`${OLD_PREFIX}thermostat`] = `An old round mechanical wall thermostat: a yellowed beige plastic dial with a scratched clear cover and a faded temperature scale, seen straight on. ${OLD} ${SHOT}`
