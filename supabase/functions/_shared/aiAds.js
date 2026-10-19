// Ads made by ChatGPT's image model, the pure half.
//
// The canvas templates (src/lib/adTemplates.js) are drawn by code, and for
// all the work on them they read as drawn. The agency's example ads (the
// RCL boiler and cash-for-clunkers posters, the summer sale grid, the fall
// special, the ads ChatGPT made for Horizon) read as a designer's poster
// with a real product photo in it. So each template can also be made by
// gpt-image-1: the example ads go in as style references, the real unit
// photo from the stock library goes in as the product, and the prompt
// carries the template's art direction and the ad's words, spelled out.
//
// The model draws everything but the brand: it leaves a plain white band
// along the bottom, and the Studio paints the client's real logo and the
// Google reviews line there (a model redraws a logo wrong). No phone
// number and no button either: Meta draws the real button.
//
// Shared three ways, so plain JavaScript with no imports: the ai-ads Edge
// Function (the prompt), the browser (the shapes, the paths, the template
// list) and scripts/check-ai-ads.mjs.
//
// Two kinds of picture: the template art (TEMPLATE_ART below), painted once
// with no words and shared by every client, which the templates paint
// their words over; and a whole ad painted with one ad's words in it
// (AI_DIRECTION, buildAiPrompt), made per ad.

/** The two canvases the model paints. Square for the square ad; tall for the 4:5 feed ad and the 9:16 Story. */
export const AI_SHAPES = {
  square: { size: '1024x1024', label: 'square' },
  tall: { size: '1024x1536', label: 'tall' },
}

/** Which painted canvas a Meta size uses. */
export function shapeForSize(size) {
  return size && size.w === size.h ? 'square' : 'tall'
}

/** The example ads the model copies the style of, shared by every client. */
export const STYLE_REF_PREFIX = 'stock/style-refs/'

/** At most this many examples go to the model with each ad. */
export const MAX_STYLE_REFS = 6

/**
 * Where a client's made ads live:
 * ai-ads/<client id>/<template>-<shape>-<stamp>-<words key>.jpg. The words
 * key ties a picture to the words painted in it (wordsKey), so an ad with
 * other words never shows it. Pictures made before the key have none.
 */
export const AI_ART_PREFIX = 'ai-ads/'

export function aiArtPath(clientId, template, shape, stamp, key = '') {
  return `${AI_ART_PREFIX}${clientId}/${template}-${shape}-${stamp}${key ? `-${key}` : ''}.jpg`
}

/** { template, shape, stamp, key } from a file name in a client's folder, or null. */
export function parseAiArtName(name) {
  const m = /^([a-z_]+)-(square|tall)-(\d+)(?:-([0-9a-f]{8}))?\.jpg$/.exec(String(name || ''))
  return m ? { template: m[1], shape: m[2], stamp: Number(m[3]), key: m[4] || '' } : null
}

/**
 * The key for the words a picture is painted with: the texts in order (the
 * roles only say where they go), FNV-1a, eight hex digits. The function
 * names the file with it and the Studio looks pictures up by it.
 */
export function wordsKey(words) {
  const text = (words || []).map((w) => clean(w?.text)).filter(Boolean).join('|')
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * The newest made picture of each template and shape from a folder listing,
 * overall and per words key:
 * { [template]: { square: path, tall: path, stamp, byWords: { [key]: { square, tall, stamp } } } }.
 */
export function latestAiArt(names, clientId) {
  const out = {}
  const keep = (slot, p, path) => {
    const at = `${p.shape}Stamp`
    if (!slot[at] || p.stamp > slot[at]) {
      slot[at] = p.stamp
      slot[p.shape] = path
      slot.stamp = Math.max(slot.stamp || 0, p.stamp)
    }
  }
  for (const name of names || []) {
    const p = parseAiArtName(name)
    if (!p) continue
    const path = `${AI_ART_PREFIX}${clientId}/${name}`
    const slot = (out[p.template] ||= { byWords: {} })
    keep(slot, p, path)
    keep((slot.byWords[p.key] ||= {}), p, path)
  }
  return out
}

/** The picture of a template painted with exactly these words ({ square, tall }), or null. */
export function aiArtFor(map, template, key) {
  const hit = map?.[template]?.byWords?.[key]
  return hit && (hit.square || hit.tall) ? { template, square: hit.square || '', tall: hit.tall || '' } : null
}

/**
 * The art direction per template: what the poster looks like, in the words a
 * designer would brief it, after the example ads. `fixed` are words the
 * design itself carries (STARTING FROM ONLY, the trade-in labels), allowed on
 * top of the ad's own words. The photo templates (a real job photo is the
 * point of them) are not here.
 */
export const AI_DIRECTION = {
  sun_deal: {
    look: 'A sky-blue sunburst of rays radiating from behind the centre, fluffy white clouds along the lower part. At the top the kicker in small, widely letterspaced navy capitals; under it the headline huge in heavy rounded capitals, its first word red with a thick white outline and a navy drop shadow, the rest navy; then the words above the price in small leaning navy capitals; then the price enormous in red with a thick white outline and a dark shadow. The product stands large in the clouds in the lower half, with a red round sticker overlapping its bottom corner.',
    fixed: ['STARTING FROM ONLY'],
  },
  clunkers: {
    look: 'A bright blue sunburst with torn black paper corners. The kicker in two lines of heavy white italic capitals with a thick black outline and a hard black drop shadow; the headline under it in heavy white italic capitals with a black shadow. Two products side by side: the old, rusty, worn-out unit on the left with TRADE-IN THIS... written across it in white capitals with a black outline, the brand-new unit on the right with AND GET THIS! written across it the same way, a big white arrow between them. Under them GET in small white capitals, the amount huge in white heavy italic capitals with a thick black outline and a shadow, and the line under it in leaning white capitals with a black outline.',
    fixed: ['TRADE-IN THIS...', 'AND GET THIS!', 'GET'],
    old: true,
  },
  split_pop: {
    look: 'A bold diagonal split: hot pink on one side, teal on the other, a few gold sparkles. The kicker in tracked white capitals at the top, BRAND NEW in heavy rounded white capitals above the headline in huge condensed white capitals with a dark shadow. The product stands on a white round pedestal in the middle. The sticker words in heavy white capitals on the left, and on the right STARTING AT small above the price in huge white numbers and the line under it.',
    fixed: ['BRAND NEW', 'STARTING AT'],
  },
  cloud_price: {
    look: 'A vivid red field. The headline in heavy navy capitals inside a big white cartoon cloud shape across the top; the price huge in white heavy capitals with a navy shadow under it, the line under it, the sticker in heavy gold capitals. A lineup of three of the product standing side by side along the bottom, front one largest.',
  },
  payment_stack: {
    look: 'A sky-blue sunburst background. The product large on the left half. On the right, stacked: the kicker in leaning white capitals with a navy outline, the price huge in red with a thick white outline and a dark shadow, the line under it in leaning white capitals with a navy outline, the headline in heavy navy capitals, and a red round sticker.',
  },
  rebate_burst: {
    look: 'A red sunburst with torn navy paper corners. The kicker in leaning white capitals with a navy outline, the amount enormous in white heavy capitals with a navy shadow, the line under it in leaning white capitals with a navy outline, a gold round sticker, the headline in white below, and the product at the bottom.',
  },
  feature_list: {
    look: 'Deep navy blue with a soft spotlight. The headline in large white heavy type at the top left, its last line in light blue. Under it three or four rows, each a white check mark in a circle and one included item. The price on its own line in light blue heavy type. The product large on the right, lit dramatically.',
  },
  winter_shout: {
    look: 'A winter scene: a soft blue sky with falling snow and a white snow drift along the bottom. The price huge in white heavy capitals with a blue outline, the headline in white with a blue outline, and the product standing in the snow drift on the right.',
  },
  massive_deal: {
    look: 'A warm glow: cream fading into orange with soft flames rising from the bottom. The kicker in two tones of heavy capitals (deep green and navy), the price filling the width in red with a white outline, a round deep-green seal with the sticker words and a yellow star, the product on the left with flames at its base.',
  },
  price_grid: {
    look: 'Clean white with bold red wave bands across the top and bottom edges. A red script word over a big blue condensed headline with red swooshes either side, then up to four prices in a two-column grid on the left, each price huge in red with its heading in small blue capitals under it and a thin red rule between the columns, and the product on the right.',
  },
  fall_special: {
    look: 'Autumn: an orange and red background with falling maple leaves. A big script Fall over Special at the top left, the two offers stacked in huge white numbers with OR between them, a round red seal with the sticker words, and the product bottom right.',
    fixed: ['Fall', 'Special', 'OR'],
  },
  season_sale: {
    look: 'The season painted behind everything (snow in winter, leaves in fall, sun in summer, blossoms in spring) and a huge SALE-style kicker in heavy capitals with an outline, the price big, the headline, the product, and a starburst sticker.',
  },
  holiday_deals: {
    look: 'Festive red and green with falling snow and a few pine branches and ornaments at the edges. The kicker in white heavy capitals, the price big with a gold outline, the headline, a sticker, and the product.',
  },
  tune_up: {
    look: 'Fresh bright green and white. The price inside a big yellow starburst, the line under it in heavy dark green, the headline above, and the product beside it.',
  },
  poster: {
    look: 'A clean white poster. Heavy condensed capitals stacked in the brand colours fill the top two thirds, the price huge in a bold brand colour, the product in the bottom left, plenty of white space.',
  },
  emergency: {
    look: 'Dark and urgent: near-black with red light streaks. A red round seal with the sticker words, the headline huge in white heavy capitals, the price huge in red with the line beside it in white, and the product lit from the side.',
  },
  financing: {
    look: 'A rich brand-colour background. The price huge in heavy white capitals with an outline, the line under it in a round seal, the product, and the other offers side by side in white numbers with a thin rule between them.',
  },
  coupon: {
    look: 'A clip-out coupon without a card: the price huge between two dashed cut lines with a little scissors mark on the top one, straight on a brand-colour background, the line under the price, the headline above the coupon, and the product beside it.',
  },
  big_number: {
    look: 'The number is the ad: the price fills the full width in heavy capitals with a thick white outline and a shadow on a brand-colour background, the line under it, the headline above, and a smaller product to one side.',
  },
  plan_card: {
    look: 'A membership plan without a card: on a soft brand-colour background, the kicker as the plan name in heavy capitals over a thin rule, the price a month huge on the right, the included items as a checklist with round check marks on the left, and the product beside them.',
  },
}

export const AI_TEMPLATE_KEYS = Object.keys(AI_DIRECTION)

export function isAiTemplate(key) {
  return Object.prototype.hasOwnProperty.call(AI_DIRECTION, String(key || ''))
}

/**
 * THE CHATGPT TEMPLATES: painted once, used for every client. ChatGPT paints
 * the art behind a template (the sunburst, the clouds, the snow, the torn
 * paper) with no words, no product and no logo; the template code paints
 * each client's words, prices, real unit photo, logo and stars on top, so
 * the words are always the client's, spelled right and editable. One
 * picture per theme (every template on that theme shares it), and three
 * templates whose art carries their own decoration (sun_deal's clouds, the
 * torn paper corners of clunkers and rebate_burst). The brand theme is
 * painted in light grey and tinted with each client's colour.
 * Stored at stock/template-art/<key>-<shape>.jpg.
 */
export const TEMPLATE_ART_PREFIX = 'stock/template-art/'

export const TEMPLATE_ART = {
  burst: { look: 'a bright royal-blue sunburst: rays fanning out from a soft white glow just above the middle, the edges and corners deepening to navy' },
  burst_red: { look: 'a vivid red sunburst: rays fanning out from a soft warm glow just above the middle, the edges and corners deepening to dark crimson' },
  pop: { look: 'a bold diagonal split: hot pink on the left two fifths, bright teal on the right, the split running from top middle down to bottom right, a soft white light in the lower middle, three or four small gold sparkle marks near the top right corner' },
  coral: { look: 'a vivid red-coral field with a soft lighter glow in the upper middle and gently darker edges, a faint fine paper grain' },
  deep: { look: 'a deep navy blue studio backdrop with a soft blue spotlight glowing on the right side, darker at the top left' },
  snow: { look: 'a soft winter sky in pale blues, gentle falling snowflakes of different sizes, and a smooth white snow drift along the bottom fifth' },
  leaves: { look: 'a rich autumn background in deep orange and red, maple and oak leaves falling and scattered, a few leaves blurred close to the camera, the middle a little calmer' },
  sun: { look: 'a sunny summer background: warm yellow to orange, a bright sun glow in the top right corner with soft rays, a hint of blue sky at the top edge' },
  fresh: { look: 'a fresh spring background in bright green and teal, soft bokeh light, a few young leaves along the corners' },
  glow: { look: 'a warm glow: cream at the top fading into orange, soft realistic flames rising along the bottom fifth' },
  night: { look: 'near-black and urgent, deep charcoal with streaks of red light sweeping diagonally, a faint red glow at the lower right' },
  holiday: { look: 'festive deep red with gentle falling snow, a few pine branches and red and gold ornaments along the top corners and edges, the middle calm' },
  paper: { look: 'a clean warm-white poster paper with a very subtle grain and a faint soft shadow toward the edges' },
  brand: { look: 'a light grey studio backdrop, almost white: soft diagonal light streaks and a gentle vignette, entirely without colour (pure greys), so it can be tinted with any brand colour', grey: true },
  sun_deal: { look: 'a bright sky-blue sunburst: rays fanning out from a soft white glow just above the middle, the corners deepening to blue, and fluffy realistic white clouds piled along the bottom fifth, edge to edge', theme: 'burst' },
  clunkers: { look: 'a bright blue sunburst: rays fanning out from a soft white glow in the middle, with torn black paper covering the top left corner (its ripped edge running from the top middle down to the left side, a fifth of the way down) and the bottom right corner (ripped edge from the bottom middle up to the right side), a few black ink flecks along the tears', theme: 'burst' },
  rebate_burst: { look: 'a vivid red sunburst: rays fanning out from a soft warm glow just above the middle, with torn navy paper covering the top left corner (its ripped edge running from the top middle down to the left side, a fifth of the way down) and the bottom right corner, a few navy ink flecks along the tears', theme: 'burst_red' },
}

export const TEMPLATE_ART_KEYS = Object.keys(TEMPLATE_ART)

export function templateArtPath(key, shape) {
  return `${TEMPLATE_ART_PREFIX}${key}-${shape}.jpg`
}

/** { key, shape } from a file name in the template-art folder, or null. */
export function parseTemplateArtName(name) {
  const m = /^([a-z_]+)-(square|tall)\.jpg$/.exec(String(name || ''))
  return m && TEMPLATE_ART[m[1]] ? { key: m[1], shape: m[2] } : null
}

/** The art a template paints on a theme: its own when it has one for that theme, else the theme's. */
export function artKeyFor(template, theme) {
  const own = TEMPLATE_ART[template]
  return own && own.theme === theme ? template : theme
}

/** The prompt for one piece of template art, painted from words alone (no example ads: handed them, the model copies their words). */
export function buildArtPrompt({ key, shape = 'square' } = {}) {
  const d = TEMPLATE_ART[key]
  if (!d) throw new Error(`No template art for ${key}.`)
  const parts = []
  parts.push(
    'Paint the background art for a loud retail poster ad for a local heating and cooling company: the finished, print-quality backdrop a designer would put behind the words, the price and the product. Rich, saturated, polished, with real depth and light.'
  )
  parts.push(`The background: ${d.look}.`)
  parts.push(
    'This is only the background. Absolutely no words, letters, numbers, price, logo, product, appliance, people, buttons, stickers, badges, boxes, frames or bars. Words and a product photo are added on top later, so keep the middle open and even enough for large words to read over it, with the detail toward the edges.'
  )
  if (d.grey) parts.push('Use only shades of grey and white: no colour at all.')
  parts.push(shape === 'tall' ? 'A tall 2:3 portrait image. It is also cropped to 4:5 and to 9:16, so nothing important at the very top, bottom or sides.' : 'A square 1:1 image.')
  return parts.join('\n\n')
}

const SHAPE_RULES = {
  square: 'A square 1:1 ad.',
  tall: 'A tall 2:3 portrait ad. It is shown two ways, cropped to 4:5 (a little off the top and bottom) and as a full-screen 9:16 Story (a little off the left and right), so keep the top 8% calm background with no words, and keep every word and the product at least 9% in from the left and right edges.',
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()

/** The words of six letters or more, once each, as "CLUNKERS = C-L-U-N-K-E-R-S". At most twelve. */
export function spellOut(texts) {
  const seen = new Set()
  const out = []
  for (const t of texts || []) {
    for (const word of String(t || '').match(/[A-Za-z]{6,}/g) || []) {
      const key = word.toUpperCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(`${word} = ${word.split('').join('-')}`)
    }
  }
  return out.slice(0, 12)
}

/**
 * The prompt for one ad. words: [{ role, text }] in reading order (the
 * browser builds them from the Studio's fields). unit: the product's name
 * ("high-efficiency gas furnace") or ''. refCount: how many example ads lead
 * the image list. colours: brand colours as hex, optional.
 */
export function buildAiPrompt({ template, words = [], unit = '', oldUnit = false, shape = 'square', refCount = 0, colours = [], season = '' } = {}) {
  const d = AI_DIRECTION[template]
  if (!d) throw new Error(`No ChatGPT direction for the ${template} template.`)
  const list = (words || []).map((w) => ({ role: clean(w.role), text: clean(w.text) })).filter((w) => w.role && w.text)
  const products = unit ? (d.old && oldUnit ? 2 : 1) : 0
  const parts = []
  parts.push(
    'Design a finished, paid Facebook and Instagram ad for a local home-services company (heating, cooling, plumbing): a loud, professional retail poster, the kind a print designer makes, not a template.'
  )
  if (refCount) {
    parts.push(
      `The first ${refCount === 1 ? 'image is an example ad' : `${refCount} images are example ads`} this agency holds up as the standard. Match their style and quality: bold heavy display type with thick outlines and drop shadows, a huge price, bursts and round stickers, saturated colour, and a real product photo as the hero. Copy the style only: none of their words, numbers, names, logos or phone numbers, and none of their boxes or bars.`
    )
  }
  if (products === 2) parts.push(`The last two images are the real product photos: first the brand-new ${unit}, then the old worn-out one. Use those exact units, cut out cleanly, large, photoreal.`)
  else if (products === 1) parts.push(`The last image is the real product photo of the ${unit}. Feature that exact unit, cut out cleanly, large, photoreal and brand new.`)
  parts.push(`The layout: ${d.look}`)
  if (colours.length) parts.push(`Lean on the brand colours ${colours.slice(0, 3).join(' and ')} where the design allows.`)
  if (season) parts.push(`It runs in ${season}.`)
  const fixed = (d.fixed || []).map((t) => `"${t}"`)
  if (list.length) {
    parts.push(
      'Put exactly these words on the ad, spelled exactly as written, with the same capitals and punctuation:\n' +
        list.map((w) => `- ${w.role}: "${w.text}"`).join('\n') +
        (fixed.length ? `\nThe design may also carry ${fixed.join(', ')}.` : '') +
        '\nNo other words at all.'
    )
  }
  // Image models misspell long words in display type (CLUNKERS came back
  // OLUNNKERS), so the longer ones are spelled out letter by letter.
  const long = spellOut(list.map((w) => w.text))
  if (long.length) parts.push(`Spell these words letter by letter exactly so: ${long.join('; ')}.`)
  parts.push(
    'Never draw a phone number, a website, a Call Now line, a button, a logo, a company name, the Google logo, review stars or fine print. Every word must be spelled correctly and fully legible.'
  )
  // Boxes around every word and number are what make an ad read as AI-made.
  parts.push(
    'No boxes: never put a word or a number inside a box, rectangle, pill, tile, banner, bar, label strip, panel, card or outlined frame. Every word and every price sits straight on the background and stands out by its size, its colour, a thick outline or a drop shadow. The only shapes allowed behind words are round stickers, starbursts, and a cloud where the layout asks for one.'
  )
  parts.push(
    'Leave the bottom 14% of the image as a plain, flat, pure white band, edge to edge, with nothing in it at all: the company logo and its reviews go there later. Keep everything else above it.'
  )
  parts.push(SHAPE_RULES[shape] || SHAPE_RULES.square)
  return parts.join('\n\n')
}
