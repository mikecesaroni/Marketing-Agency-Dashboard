// Self-check for the ChatGPT versions of the templates: the prompt carries
// the words exactly, the bans and the white band; every template but the
// photo ones has a direction; the Studio picks the newest picture per
// template and shape; the renderer paints the picture only when it belongs
// to the picked template.
// Run: node scripts/check-ai-ads.mjs
import { readFileSync } from 'node:fs'
import { AI_TEMPLATE_KEYS, aiArtPath, buildAiPrompt, latestAiArt, parseAiArtName, shapeForSize, spellOut } from '../supabase/functions/_shared/aiAds.js'
import { PHOTO_TEMPLATES, TEMPLATE_KEYS } from '../src/lib/adTemplateMeta.js'

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
check('a template with no direction is refused', (() => {
  try {
    buildAiPrompt({ template: 'photo_sale' })
    return false
  } catch {
    return true
  }
})(), true)

check('square for the square ad, tall for the feed and the Story', [shapeForSize({ w: 1080, h: 1080 }), shapeForSize({ w: 1080, h: 1350 }), shapeForSize({ w: 1080, h: 1920 })], ['square', 'tall', 'tall'])
check('the path and its parse agree', parseAiArtName(aiArtPath('c1', 'sun_deal', 'tall', 123).split('/').pop()), { template: 'sun_deal', shape: 'tall', stamp: 123 })
const latest = latestAiArt(['sun_deal-tall-100.jpg', 'sun_deal-tall-300.jpg', 'sun_deal-square-200.jpg', 'junk.png', 'clunkers-square-5.jpg'], 'c1')
check('the newest picture of each template and shape wins', [latest.sun_deal.tall, latest.sun_deal.square, latest.clunkers.square, latest.clunkers.tall], ['ai-ads/c1/sun_deal-tall-300.jpg', 'ai-ads/c1/sun_deal-square-200.jpg', 'ai-ads/c1/clunkers-square-5.jpg', undefined])

const canvas = read('src/lib/adCanvas.js')
check('the renderer paints the picture only for its own template', canvas.includes('content.aiArt?.template === layout'), true)
const tpl = read('src/lib/adTemplates.js')
check('the real logo and Google card go on the band', /export function renderAiArt[\s\S]{0,2000}brandFooter\(ctx, m, content, assets, \{ band: true \}\)\.draw\(\)/.test(tpl), true)
const fn = read('supabase/functions/ai-ads/index.ts')
check('the function sends the examples, then the unit, to the image edits endpoint', [fn.includes("'https://api.openai.com/v1/images/edits'"), fn.includes("form.append('image[]'"), fn.includes('MAX_STYLE_REFS')], [true, true, true])
check('the function has the same door as stock-images', [fn.includes('async function allowed('), fn.includes('x-fill-token')], [true, true])

console.log(failures === 0 ? '\nAll ChatGPT ad checks pass' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
