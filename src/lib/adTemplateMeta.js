// What the templates are, without any drawing: their names and hints, the
// themes, the equipment cutouts, and the small pure helpers (which theme a
// season gets, the kicker when nobody typed one, the offer tiles). Kept free
// of imports so adLayout.js and the Node self-checks can read it.

/**
 * The templates, in the order the gallery shows them. `photo` marks the ones
 * that paint the client's photo (dragging the artboard moves its focal point).
 */
export const TEMPLATE_LAYOUTS = [
  { key: 'winter_shout', label: 'Winter shout', hint: 'snow, the logo up top, a giant outlined offer, the unit standing in the drift', theme: 'snow' },
  { key: 'massive_deal', label: 'Massive deal', hint: 'a warm glow with flames, MASSIVE DEALS in two tones, a price that fills the frame, a seal and a SALE star', theme: 'glow' },
  { key: 'stay_warm', label: 'Stay warm', hint: 'the photo under a diagonal in the accent colour, a headline stack beside it, a band of offers along the bottom', photo: true },
  { key: 'price_grid', label: 'Price grid', hint: 'a script season word, a big SALE headline, a grid of up to four prices beside the unit', theme: 'paper' },
  { key: 'fall_special', label: 'Fall special', hint: 'leaves, a script "Fall", two offers stacked with OR between, a seal, the unit', theme: 'leaves' },
  { key: 'season_sale', label: 'Season sale', hint: 'the season painted behind a huge SALE, the offer, the unit, a starburst sticker' },
  { key: 'holiday_deals', label: 'Holiday deals', hint: 'red and green with snow, HOLIDAY DEALS, the offer and a sticker', theme: 'holiday' },
  { key: 'tune_up', label: 'Tune-up', hint: 'fresh green, the service price in a starburst, the detail in the accent colour', theme: 'fresh' },
  { key: 'poster', label: 'White poster', hint: 'white, condensed capitals stacked in the brand colours, logo and Google stars, the unit bottom-left', theme: 'paper' },
  { key: 'emergency', label: 'Same day', hint: 'dark and urgent, a 24/7 seal, the headline huge, the offer on a pill', theme: 'night' },
  { key: 'financing', label: 'Financing', hint: '$0 down huge, monthly payments in a seal, extra offers as tiles', theme: 'brand' },
  { key: 'coupon', label: 'Coupon', hint: 'a dashed coupon with the offer inside, the headline under it', theme: 'paper' },
  { key: 'big_number', label: 'Big number', hint: 'the amount fills the width and that is the ad', theme: 'brand' },
  { key: 'photo_sale', label: 'Photo sale', hint: 'the photo full-bleed with a SALE ribbon in the corner, the offers on a band below', photo: true },
]

export const TEMPLATE_KEYS = TEMPLATE_LAYOUTS.map((t) => t.key)

export const PHOTO_TEMPLATES = TEMPLATE_LAYOUTS.filter((t) => t.photo).map((t) => t.key)

export function isTemplate(key) {
  return TEMPLATE_KEYS.includes(key)
}

/** The painted backgrounds. `ink` says whether dark or light type reads on it. */
export const THEME_LAYOUTS = [
  { key: 'snow', label: 'Snow', ink: 'dark' },
  { key: 'leaves', label: 'Fall leaves', ink: 'light' },
  { key: 'sun', label: 'Summer sun', ink: 'dark' },
  { key: 'fresh', label: 'Spring fresh', ink: 'light' },
  { key: 'glow', label: 'Warm glow', ink: 'dark' },
  { key: 'night', label: 'Night', ink: 'light' },
  { key: 'holiday', label: 'Holiday', ink: 'light' },
  { key: 'paper', label: 'White poster', ink: 'dark' },
  { key: 'brand', label: 'Brand colour', ink: 'auto' },
]

export const THEME_KEYS = THEME_LAYOUTS.map((t) => t.key)

/** The built-in equipment drawings. A stock photo is `stock:<path>` instead. */
export const CUTOUTS = [
  { key: 'ac', label: 'AC unit' },
  { key: 'furnace', label: 'Furnace' },
  { key: 'boiler', label: 'Boiler' },
  { key: 'water_heater', label: 'Water heater' },
  { key: 'mini_split', label: 'Mini split' },
  { key: 'thermostat', label: 'Thermostat' },
]

const SEASON_THEME = { fall: 'leaves', winter: 'snow', summer: 'sun', spring: 'fresh', holiday: 'holiday' }

/**
 * The theme to paint: the one picked, else the template's own, else the
 * season's, else the brand colour.
 */
export function themeFor(content) {
  if (content?.theme && THEME_KEYS.includes(content.theme)) return content.theme
  const own = TEMPLATE_LAYOUTS.find((t) => t.key === content?.layout)?.theme
  if (own) return own
  return SEASON_THEME[content?.season] || 'brand'
}

const SEASON_KICKER = { fall: 'Fall Special', winter: 'Winter Sale', summer: 'Summer Sale', spring: 'Spring Sale', holiday: 'Holiday Deals' }

/** The words above the headline when nobody typed any. */
export function seasonKicker(season) {
  return SEASON_KICKER[season] || 'Massive Deals'
}

/** The kicker to paint: typed, else the season's. */
export function kickerFor(content) {
  return String(content?.kicker || '').trim() || seasonKicker(content?.season)
}

/** Up to four offer tiles: the typed ones, else the main offer as one tile, else none. */
export function offersFor(content) {
  const typed = (Array.isArray(content?.offers) ? content.offers : [])
    .map((o) => ({ amount: String(o?.amount || '').trim(), detail: String(o?.detail || '').trim() }))
    .filter((o) => o.amount || o.detail)
  if (typed.length) return typed.slice(0, 4)
  const amount = String(content?.offerAmount || '').trim()
  const detail = String(content?.offerDetail || '').trim()
  return amount || detail ? [{ amount, detail }] : []
}

/** The offers as stored: the typed tiles trimmed, or null when there are none. */
export function offersToStore(offers) {
  const list = (Array.isArray(offers) ? offers : [])
    .map((o) => ({ amount: String(o?.amount || '').trim(), detail: String(o?.detail || '').trim() }))
    .filter((o) => o.amount || o.detail)
  return list.length ? list.slice(0, 4) : null
}
