// Self-check for the ChatGPT templates (the art painted once, no words) and
// the ChatGPT versions of single ads: the prompt carries
// the words exactly, the bans and the white band; every template but the
// photo ones has a direction; the Studio picks the newest picture per
// template and shape, and uses one only for the words painted in it; the
// renderer paints the picture only when it belongs to the picked template;
// nothing asks for a box around the words.
// Run: node scripts/check-ai-ads.mjs
import { readFileSync } from 'node:fs'
import { AI_DIRECTION, AI_TEMPLATE_KEYS, TEMPLATE_ART, TEMPLATE_ART_KEYS, aiArtFor, aiArtPath, artKeyFor, buildAiPrompt, buildArtPrompt, latestAiArt, parseAiArtName, parseTemplateArtName, shapeForSize, spellOut, templateArtPath, wordsKey } from '../supabase/functions/_shared/aiAds.js'
import { PHOTO_TEMPLATES, TEMPLATE_KEYS, TEMPLATE_LAYOUTS, THEME_KEYS } from '../src/lib/adTemplateMeta.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

check('every drawn template but the photo ones has a ChatGPT version', AI_TEMPLATE_KEYS.slice().sort(), TEMPLATE_KEYS.filter((k) => !PHOTO_TEMPLATES.includes(k)).sort())

const prompt = buildAiPrompt({
  template: 'clunkers',
  words: [
    { role: 'Kicker', text: 'CASH FOR CLUNKERS' },
    { role: 'Price', text: '$1,000' },
    { role: 'Empty', text: '  ' },
  ],
  unit: 'gas furnace',
  oldUnit: true,
  shape: 'tall',
  refCount: 6,
  colours: ['#0B2A5B'],
})
check('the words go in exactly, empty ones left out', [prompt.includes('- Kicker: "CASH FOR CLUNKERS"'), prompt.includes('- Price: "$1,000"'), prompt.includes('Empty')], [true, true, false])
check('long words are spelled out letter by letter, once each', [spellOut(['CASH FOR CLUNKERS', 'clunkers again', 'TOWARDS A NEW SYSTEM']), prompt.includes('CLUNKERS = C-L-U-N-K-E-R-S')], [['CLUNKERS = C-L-U-N-K-E-R-S', 'TOWARDS = T-O-W-A-R-D-S', 'SYSTEM = S-Y-S-T-E-M'], true])
check('the examples lead and only their style is copied', [prompt.includes('The first 6 images are example ads'), prompt.includes('Copy the style only')], [true, true])
check('a trade-in gets the new and the old unit', prompt.includes('first the brand-new gas furnace, then the old worn-out one'), true)
check('no phone, no button, no logo, no Google stars', /Never draw a phone number, a website, a Call Now line, a button, a logo, a company name, the Google logo, review stars/.test(prompt), true)
check('the white band is left for the real logo', prompt.includes('bottom 14% of the image as a plain, flat, pure white band'), true)
check('the tall picture keeps clear of both crops', prompt.includes('cropped to 4:5') && prompt.includes('9:16 Story'), true)
check('no em dashes in the prompt', /[—–]/.test(prompt), false)
check('no boxes, pills, bars or tiles around the words', [prompt.includes('No boxes: never put a word or a number inside a box'), prompt.includes('none of their boxes or bars')], [true, true])
check(
  'no template is briefed with a box, pill, bar, tile, panel or card around its words',
  Object.entries(AI_DIRECTION)
    .filter(([, d]) => /\b(pill|tiles?|bars?|panel|box|colour block|label strip)\b/i.test(d.look.replace(/without a card/g, '')) || /\bcard\b/i.test(d.look.replace(/without a card/g, '')))
    .map(([k]) => k),
  []
)
check('a template with no direction is refused', (() => {
  try {
    buildAiPrompt({ template: 'photo_sale' })
    return false
  } catch {
    return true
  }
})(), true)

check('square for the square ad, tall for the feed and the Story', [shapeForSize({ w: 1080, h: 1080 }), shapeForSize({ w: 1080, h: 1350 }), shapeForSize({ w: 1080, h: 1920 })], ['square', 'tall', 'tall'])
check('the path and its parse agree', parseAiArtName(aiArtPath('c1', 'sun_deal', 'tall', 123, 'a1b2c3d4').split('/').pop()), { template: 'sun_deal', shape: 'tall', stamp: 123, key: 'a1b2c3d4' })
check('a picture from before the words key still parses, with no key', parseAiArtName('sun_deal-tall-123.jpg'), { template: 'sun_deal', shape: 'tall', stamp: 123, key: '' })
const k1 = wordsKey([{ role: 'Headline', text: 'Boiler deal' }, { role: 'Price', text: '$139/mo' }])
check('the words key follows the words, not the roles or the spacing', [k1 === wordsKey([{ role: 'Other', text: ' Boiler  deal ' }, { role: 'Price', text: '$139/mo' }]), k1 === wordsKey([{ role: 'Headline', text: 'Boiler deal' }, { role: 'Price', text: '$149/mo' }]), /^[0-9a-f]{8}$/.test(k1)], [true, false, true])
const keyed = latestAiArt([`sun_deal-tall-100-${k1}.jpg`, `sun_deal-square-101-${k1}.jpg`, 'sun_deal-tall-300-ffffffff.jpg'], 'c1')
check(
  'a picture is used only for the words painted in it',
  [aiArtFor(keyed, 'sun_deal', k1), aiArtFor(keyed, 'sun_deal', '00000000'), keyed.sun_deal.tall],
  [{ template: 'sun_deal', square: `ai-ads/c1/sun_deal-square-101-${k1}.jpg`, tall: `ai-ads/c1/sun_deal-tall-100-${k1}.jpg` }, null, 'ai-ads/c1/sun_deal-tall-300-ffffffff.jpg']
)
const latest = latestAiArt(['sun_deal-tall-100.jpg', 'sun_deal-tall-300.jpg', 'sun_deal-square-200.jpg', 'junk.png', 'clunkers-square-5.jpg'], 'c1')
check('the newest picture of each template and shape wins', [latest.sun_deal.tall, latest.sun_deal.square, latest.clunkers.square, latest.clunkers.tall], ['ai-ads/c1/sun_deal-tall-300.jpg', 'ai-ads/c1/sun_deal-square-200.jpg', 'ai-ads/c1/clunkers-square-5.jpg', undefined])

const canvas = read('src/lib/adCanvas.js')
check('the renderer paints the picture only for its own template', canvas.includes('content.aiArt?.template === layout'), true)
const tpl = read('src/lib/adTemplates.js')
check('the real logo and Google stars go on the band', /export function renderAiArt[\s\S]{0,2000}brandFooter\(ctx, m, content, assets, \{ band: true \}\)\.draw\(\)/.test(tpl), true)
const fn = read('supabase/functions/ai-ads/index.ts')
check('the function sends the examples, then the unit, to the image edits endpoint', [fn.includes("'https://api.openai.com/v1/images/edits'"), fn.includes("form.append('image[]'"), fn.includes('MAX_STYLE_REFS')], [true, true, true])
check('the function names the picture with its words key', fn.includes('aiArtPath(clientId, template, shape, Date.now(), key)'), true)
const studio = read('src/components/AdStudioPanel.jsx')
check('the Studio and Save all 3 ads use the picture painted with each ad’s words', [studio.includes('const aiMatch = aiArtForAd(aiArtMap'), studio.includes('const art = aiOn ? aiArtForAd(aiArtMap, content) : null')], [true, true])
check('a revised ad uses the picture painted with its new words', read('src/lib/adRevisionStore.js').includes('aiArtForAd(await listAiArt(client.id)'), true)
check('the function has the same door as stock-images', [fn.includes('async function allowed('), fn.includes('x-fill-token')], [true, true])

// The ChatGPT templates: art painted once, no words, shared by every client.
check('every theme has ChatGPT art', THEME_KEYS.filter((k) => !TEMPLATE_ART[k]), [])
check(
  'a template with its own art is on that theme',
  TEMPLATE_ART_KEYS.filter((k) => TEMPLATE_ART[k].theme).map((k) => [k, TEMPLATE_ART[k].theme === TEMPLATE_LAYOUTS.find((t) => t.key === k)?.theme]),
  [['sun_deal', true], ['clunkers', true], ['rebate_burst', true]]
)
check('a template paints its own art on its own theme, the theme’s art on any other', [artKeyFor('clunkers', 'burst'), artKeyFor('clunkers', 'snow'), artKeyFor('payment_stack', 'burst'), artKeyFor('poster', 'paper')], ['clunkers', 'snow', 'burst', 'paper'])
check('the art path and its parse agree; junk is ignored', [parseTemplateArtName(templateArtPath('sun_deal', 'tall').split('/').pop()), parseTemplateArtName('nope-tall.jpg'), templateArtPath('snow', 'square')], [{ key: 'sun_deal', shape: 'tall' }, null, 'stock/template-art/snow-square.jpg'])
const artPrompt = buildArtPrompt({ key: 'brand', shape: 'tall' })
check('the art has no words, no product, no logo, no boxes', [artPrompt.includes('Absolutely no words, letters, numbers, price, logo, product'), artPrompt.includes('boxes, frames or bars')], [true, true])
check('the brand art is grey, to be tinted with each client’s colour', [artPrompt.includes('only shades of grey'), buildArtPrompt({ key: 'snow' }).includes('only shades of grey')], [true, false])
check('no em dashes in the art prompts', TEMPLATE_ART_KEYS.filter((k) => /[—–]/.test(buildArtPrompt({ key: k, shape: 'tall' }))), [])
check('the function paints the art from the words alone and keeps one picture per key and shape', [fn.includes("if (action === 'art')"), fn.includes("'https://api.openai.com/v1/images/generations'"), fn.includes('templateArtPath(key, shape)')], [true, true, true])
check(
  'the templates paint the art in place of the drawn theme, tint the brand, and leave off the clouds and torn corners the art carries',
  [tpl.includes('const pics = art?.pictures?.[artKey]'), tpl.includes("ctx.globalCompositeOperation = 'multiply'"), tpl.includes("if (!ownClouds) clouds("), tpl.includes(".art !== 'clunkers') torn("), tpl.includes("theme.art !== 'rebate_burst') torn(")],
  [true, true, true, true, true]
)
check('the Studio, Save all 3 ads and a revision all load the art', [studio.includes('templateArtBitmaps(loadImage)'), studio.includes('templateArt: artBitmaps.current }, { safeMode, guides: false })'), read('src/lib/adRevisionStore.js').includes('await templateArtBitmaps(loadImage)')], [true, true, true])

console.log(failures === 0 ? '\nAll ChatGPT ad checks pass' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
