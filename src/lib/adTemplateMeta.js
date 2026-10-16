// What the templates are, without any drawing: their names and hints, the
// themes, the equipment cutouts, and the small pure helpers (which theme a
// season gets, the kicker when nobody typed one, the offer tiles). Kept free
// of imports so adLayout.js and the Node self-checks can read it.

/**
 * The templates, in the order the gallery shows them. `photo` marks the ones
 * that paint the client's photo (dragging the artboard moves its focal point).
 */
export const TEMPLATE_LAYOUTS = [
  // The retail posters, modelled on the ads the agency holds up as the
  // standard: a sunburst, slanted bars, a price with an outline and a
  // shadow, the unit as the hero, a Google reviews card.
  { key: 'sun_deal', label: 'Sunburst deal', hint: 'a sky-blue sunburst, MASSIVE in letterspaced caps, the headline in two colours, STARTING FROM ONLY on a bar, the price huge with a white outline, the unit standing in clouds with a red badge, logo and Google card on a white band', theme: 'burst' },
  { key: 'clunkers', label: 'Cash for clunkers', hint: 'a blue sunburst with torn black corners, the kicker on slanted black bars, the old rusty unit and the new one with an arrow between, GET $1,000 huge, the detail on a black bar, the Google card', theme: 'burst' },
  { key: 'split_pop', label: 'Brand new', hint: 'pink and teal split on a diagonal, the kicker in a gold pill, BRAND NEW over the headline, the unit on a white pedestal, the sticker in a teal box left, STARTING AT and the price right', theme: 'pop' },
  { key: 'cloud_price', label: 'Price cloud', hint: 'a red field, the headline in a white cloud, the offer line, the sticker in a gold pill, the unit as a lineup of three', theme: 'coral' },
  { key: 'payment_stack', label: 'Payment stack', hint: 'the unit on the left, the monthly number stacked on the right: kicker bar, price huge, terms bar, headline, a red badge; logo and Google card on a white band', theme: 'burst' },
  { key: 'rebate_burst', label: 'Rebate burst', hint: 'a red sunburst with torn navy corners, GET UP TO on a bar, the rebate huge in white, BACK IN REBATES on a bar, a gold sticker, the headline, the unit', theme: 'burst_red' },
  { key: 'feature_list', label: 'Feature list', hint: 'deep blue, the logo small up top, the headline with its last line in light blue, what is included as ticked rows (the subhead split on commas), the offer in an outlined pill, the unit large on the right', theme: 'deep' },
  { key: 'winter_shout', label: 'Winter shout', hint: 'snow, the logo up top, a giant outlined offer, the unit standing in the drift', theme: 'snow' },
  { key: 'massive_deal', label: 'Massive deal', hint: 'a warm glow with flames, MASSIVE DEALS in two tones, a price that fills the frame, a seal and a SALE star', theme: 'glow' },
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
  { key: 'before_sale', label: 'Before and after sale', hint: 'the two photos side by side (one above the other on the Story), Before and After tagged, the kicker, the headline and the offer tiles on the season below', photo: true, twoPhotos: true },
  { key: 'reveal', label: 'Before inset', hint: 'the After photo whole, the Before as a small framed inset bottom-left, the words on a brand-colour plate', photo: true, twoPhotos: true },
  { key: 'plan_card', label: 'Maintenance plan', hint: 'a membership card: the plan name on a brand-colour band, the price a month, and what is included as a checklist (the subhead, split on commas)', theme: 'brand' },
]

export const TEMPLATE_KEYS = TEMPLATE_LAYOUTS.map((t) => t.key)

/** The photo looks (adLooks.js) a chat may name for an ad, beside the templates. */
export const PHOTO_LOOK_KEYS = ['cover', 'stack', 'plate', 'split', 'before']

/** True for a key the Studio can paint: a template or a photo look. */
export function isLookKey(key) {
  const k = String(key || '').trim()
  return TEMPLATE_KEYS.includes(k) || PHOTO_LOOK_KEYS.includes(k)
}

/**
 * When each template wins and what it needs in words, so the chat can pick
 * one per ad and write the words to its shape (a plan card wants a list,
 * a price grid wants tiles, a big number wants one number).
 */
export const TEMPLATE_SHAPES = {
  sun_deal: { wins: 'a replacement or install deal with a monthly payment or a starting price: the loud retail poster', needs: 'a one-word kicker like MASSIVE or HUGE, a two-word headline like BOILER DEAL or FURNACE SALE, a price or a monthly number as the offer amount, what it buys as the offer detail, a short sticker for the red badge like MONTHLY PAYMENTS CHEAPER THAN DATE NIGHT' },
  clunkers: { wins: 'a trade-in or replace-your-old-unit offer: cash for your clunker, trade in and save', needs: 'a kicker like CASH FOR CLUNKERS, a headline like TRADE IN YOUR OLD FURNACE, a dollar amount as the offer, TOWARDS A NEW SYSTEM as the offer detail, the equipment set (the old one paints rusty)' },
  split_pop: { wins: 'a brand-new system at a starting price, bright and upbeat', needs: 'a kicker like SPECIAL LIMITED OFFER, a headline like BRAND NEW AC SYSTEM, the starting or monthly price as the offer amount, PER MONTH or INSTALLED as the offer detail, a sticker like GET A FREE ESTIMATE' },
  cloud_price: { wins: 'the best price on a kind of equipment: one dollar-off offer, said plainly', needs: 'a headline like BEST PRICE ON FURNACES, the dollars off as the offer amount, what it is off as the offer detail, a sticker like LIMITED TIME' },
  payment_stack: { wins: 'a monthly payment or $0 down beside the unit', needs: 'a kicker like EASY FINANCING or $0 DOWN, the monthly number as the offer amount, the terms as the offer detail, a headline of four to eight words, a sticker' },
  rebate_burst: { wins: 'rebates, tax credits, cash back: up to $X back', needs: 'GET UP TO as the kicker, the dollar amount as the offer, BACK IN REBATES or IN TAX CREDITS as the offer detail, a headline, a sticker like LIMITED TIME' },
  feature_list: { wins: 'a system or a plan sold on what it includes, the premium product ad', needs: 'a headline of two short sentences (the second is the pay-off), the subhead as a comma-separated list of three or four things included, the price or the terms as the offer' },
  winter_shout: { wins: 'a winter offer with a dollar amount; the be-ready-for-winter poster', needs: 'a short kicker, a dollar offer, a headline of six to ten words' },
  massive_deal: { wins: 'a loud replacement or install deal with a big price', needs: 'a kicker like MASSIVE DEALS or WINTER SALE, a dollar offer, a one-line sticker' },
  price_grid: { wins: 'several services with a price each (tune-up, plan, install)', needs: 'two to four offer tiles with a price and a line each, a headline' },
  fall_special: { wins: 'a fall offer with two choices (this OR that)', needs: 'two offer tiles, a short headline, a one-line sticker' },
  season_sale: { wins: 'a seasonal sale: the season word and SALE huge', needs: 'a kicker ending in SALE or DEALS, a dollar offer, a headline' },
  holiday_deals: { wins: 'November and December offers, year-end deadlines', needs: 'a dollar offer, a headline with the deadline, a one-line sticker' },
  tune_up: { wins: 'a tune-up, inspection or check-up with a price', needs: 'the service price as the offer amount, the service as the offer detail, a headline' },
  poster: { wins: 'a clean type-only poster, the headline doing the work', needs: 'a kicker, a headline of six to ten words, a subhead of one line, a dollar offer' },
  emergency: { wins: 'same-day, 24/7, no heat, no AC, no hot water, a burst pipe', needs: 'a headline that speaks to someone whose system just broke, the sticker 24/7 or SAME DAY, the visit price as the offer' },
  financing: { wins: '$0 down, 0% for N months, a monthly payment', needs: '$0 down or a monthly number as the offer amount, the terms as the offer detail, a sticker like MONTHLY PAYMENTS' },
  coupon: { wins: 'one clip-out offer: a dollar or percent off, a free item', needs: 'one offer with a price or FREE, a short headline, the fine print as the subhead' },
  big_number: { wins: 'one number is the whole ad: $500 OFF, 50% OFF', needs: 'a short offer amount (a number with $ or %), the rest as the offer detail, a short headline' },
  photo_sale: { wins: 'a strong photo with the offers under it', needs: 'a headline, a subhead, one to three offer tiles, a one-word sticker' },
  before_sale: { wins: 'a real before and after pair of the same job', needs: 'a transformation headline, one or two offer tiles; the two photos come from the finder or the pickers' },
  reveal: { wins: 'a real before and after pair where the after is the hero', needs: 'a transformation headline, a dollar offer; the two photos come from the finder or the pickers' },
  plan_card: { wins: 'a maintenance plan, a club, a membership', needs: 'the plan name as the kicker, the price a month as the offer amount, the terms as the offer detail, and the subhead as a comma-separated list of three to five things included' },
}

/** The templates as a menu for the chat: key, name, when it wins, what it needs. */
export function templateMenu() {
  return TEMPLATE_LAYOUTS.map((t) => {
    const s = TEMPLATE_SHAPES[t.key] || {}
    return `- ${t.key} (${t.label}): wins for ${s.wins || t.hint}. Needs ${s.needs || 'the usual slots'}.`
  }).join('\n')
}

export const PHOTO_TEMPLATES = TEMPLATE_LAYOUTS.filter((t) => t.photo).map((t) => t.key)

/** The templates that take a second photo (the After picker), like the before-and-after look. */
export const TWO_PHOTO_TEMPLATES = TEMPLATE_LAYOUTS.filter((t) => t.twoPhotos).map((t) => t.key)

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
  { key: 'burst', label: 'Sunburst', ink: 'light' },
  { key: 'burst_red', label: 'Sunburst red', ink: 'light' },
  { key: 'pop', label: 'Pink and teal', ink: 'light' },
  { key: 'coral', label: 'Coral', ink: 'light' },
  { key: 'deep', label: 'Deep blue', ink: 'light' },
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
