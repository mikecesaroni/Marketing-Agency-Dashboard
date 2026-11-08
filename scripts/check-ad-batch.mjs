// Self-check for "Make 3 ads": the prompt asks for the right number and the
// JSON, each set gets its own look, the starting photo is the newest real
// upload, and edits survive a switch between sets.
// Run: node scripts/check-ad-batch.mjs

import { BATCH_LOOKS, BATCH_MAX, BATCH_PHOTO_MAX, SET_FIELDS, assignLooks, assignPhotos, batchReady, cutoutFor, lookName, lookShape, makeAdsPrompt, photoPool, pickBackground, planLabel, setTitle, snapshotSet, templateAsk, templatesFor, tilesFrom } from '../src/lib/adBatch.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// The prompt.
const p = makeAdsPrompt({ count: 3, clientName: 'Prime Heating & Cooling', today: new Date('2026-10-14') })
check('asks for three ads for the client, this month', /Write 3 static ads for Prime Heating & Cooling to run now, in October/.test(p), true)
check('three angles when three ads', /the current offer, the time of year, and proof or trust/.test(p), true)
check('every FORMAT 2 slot', /fill every slot of FORMAT 2/.test(p), true)
check('ends with the JSON block of exactly three', /JSON block of exactly 3 creative_sets/.test(p), true)
check('no placeholders on the image', /No brackets, no placeholders, no phone numbers or web addresses/.test(p), true)
check('a count of two drops the third angle', /the current offer and the time of year, one ad each/.test(makeAdsPrompt({ count: 2, today: new Date('2026-01-05') })), true)
check('the count is clamped, and one ad reads as one ad', /Write 6 static ads/.test(makeAdsPrompt({ count: 40 })) && /Write 1 static ad for .* one ad\./.test(makeAdsPrompt({ count: -2 })), true)
check('the ask lists the templates and wants a pick per ad', /"template" key/.test(p) && /plan_card \(Maintenance plan\)/.test(p) && /never the same one twice/.test(p), true)
check('an ask that names a template writes to its shape instead of the menu', /"Maintenance plan" template/.test(makeAdsPrompt({ template: 'plan_card' })) && !/"template" key/.test(makeAdsPrompt({ template: 'plan_card' })), true)
check('an unknown template falls back to the menu', /"template" key/.test(makeAdsPrompt({ template: 'nope' })), true)
check('a subject goes in the first line', /about this: the \$89 furnace tune-up\./.test(makeAdsPrompt({ count: 1, about: 'the $89 furnace tune-up' })), true)
check('the template ask says what the template needs', /comma-separated list/.test(templateAsk('plan_card')) && templateAsk('zzz') === '', true)
check('a missing name still reads', /for this client to run now/.test(makeAdsPrompt({})), true)

// The template picker: "pick a template and have the Studio make N ads on
// it, or tick three templates and get three ads".
check('nothing ticked: the chat picks', templatesFor([], 3), [])
check('one ticked and a count: that many on it', templatesFor(['price_grid'], 4), ['price_grid', 'price_grid', 'price_grid', 'price_grid'])
check('three ticked: one each, in the order ticked', templatesFor(['price_grid', 'coupon', 'wash'], 1), ['price_grid', 'coupon', 'wash'])
check('three ticked, two each: six, grouped by template', templatesFor(['price_grid', 'coupon', 'wash'], 2), ['price_grid', 'price_grid', 'coupon', 'coupon', 'wash', 'wash'])
check('four ticked, two each: six is the most, so one each', templatesFor(['price_grid', 'coupon', 'wash', 'sun_deal'], 2).length, 4)
check('a key that is not a look is dropped; a repeat is one tick', templatesFor(['nope', 'coupon', 'coupon'], 1), ['coupon'])
check('the count is clamped to six', templatesFor(['coupon'], 40).length, BATCH_MAX)
check('the plan in words', [planLabel([], 3), planLabel([], 1), planLabel(['price_grid'], 4), planLabel(['price_grid', 'coupon', 'wash'], 1), planLabel(['price_grid', 'coupon', 'wash'], 2)], ['Make 3 ads', 'Make an ad', 'Make 4 ads on Price grid', 'Make 3 ads: Price grid, Coupon, Brand wash', 'Make 6 ads: 2 each on Price grid, Coupon, Brand wash'])
const planned = makeAdsPrompt({ clientName: 'Prime', today: new Date('2026-10-14'), templates: ['price_grid', 'coupon', 'wash'] })
check('a plan decides the count and the look of each ad, in order', [/Write 3 static ads for Prime/.test(planned), /Ad 1: Price grid \(/.test(planned), /Ad 2: Coupon \(/.test(planned), /Ad 3: Brand wash \(/.test(planned), /JSON block of exactly 3/.test(planned)], [true, true, true, true, true])
check('a plan does not ask the chat to pick a template', /"template" key/.test(planned), false)
const same = makeAdsPrompt({ clientName: 'Prime', count: 2, templates: ['price_grid', 'price_grid', 'price_grid', 'price_grid'] })
check('the same template four times: four ads on it, each its own hook', [/Write 4 static ads/.test(same), /"Price grid" template/.test(same), /All 4 ads go on it, each on its own hook/.test(same)], [true, true, true])
check('a photo look can be asked for too', /"Brand wash" look/.test(templateAsk('wash')) && /5% OFF/.test(templateAsk('wash')), true)
check('the story text look asks for a claim with one number in it', /"Story text" look/.test(templateAsk('typed')) && /2-3% of roofers/.test(templateAsk('typed')), true)
check('a look shape: a template, a photo look, nothing', [lookShape('coupon')?.label, lookShape('coupon')?.photo, lookShape('stack')?.label, lookShape('stack')?.photo, lookShape('zzz')], ['Coupon', false, 'Headline stack', true, null])

// The looks.
check('a poster for the offer, the season template for the time of year, the owner photo for proof, then another round (the offer on the brand wash, the proof typed over a job photo)', BATCH_LOOKS, ['sun_deal', 'season_sale', 'stack', 'wash', 'price_grid', 'typed'])
check('each set gets the next look', assignLooks([{ hook: 'a' }, { hook: 'b' }, { hook: 'c' }, { hook: 'd' }, { hook: 'e' }, { hook: 'f' }]).map((s) => s.layout), ['sun_deal', 'season_sale', 'stack', 'wash', 'price_grid', 'typed'])
check('the brand wash and the story text have names', [lookName('wash'), lookName('typed')], ['Brand wash', 'Story text'])
check('the batch asks for a sticker and offer tiles', /"sticker"/.test(makeAdsPrompt({ clientName: 'Prime' })) && /"offers"/.test(makeAdsPrompt({ clientName: 'Prime' })), true)
check('tiles: blanks dropped, four at most, either key spelling', tilesFrom([{ amount: ' $0 ', detail: 'Down' }, { offer_amount: '$89', offer_detail: 'Tune-up' }, {}, { amount: '1' }, { amount: '2' }, { amount: '3' }]).map((o) => o.amount), ['$0', '$89', '1', '2'])
check('tiles: junk is an empty list', tilesFrom('no'), [])
check('an HVAC company gets a furnace in the heating months', cutoutFor('HVAC', new Date(2026, 10, 1)), 'furnace')
check('and a condenser in the cooling ones', cutoutFor('Heating & Cooling', new Date(2026, 6, 1)), 'ac')
check('a plumber gets a water heater', cutoutFor('Plumbing', new Date(2026, 6, 1)), 'water_heater')
check('a roofer gets nothing', cutoutFor('Roofing', new Date(2026, 6, 1)), '')
check('the set fields carry the template extras and the second photo', SET_FIELDS.slice(-6), ['backgroundPath2', 'kicker', 'sticker', 'offers', 'cutout', 'theme'])
check('a set that names a look keeps it', assignLooks([{ hook: 'a', layout: 'cover' }])[0].layout, 'cover')
check('a look has a name', [lookName('stack'), lookName('plate'), lookName('split'), lookName('zzz')], ['Headline stack', 'Bottom plate', 'Split panel', 'zzz'])

// The starting photo.
const files = [
  { file_name: 'logo.png', storage_path: 'c1/logo.png', date_uploaded: '2026-10-01' },
  { file_name: 'ad-1-square.png', storage_path: 'ads/c1/1-square.png', date_uploaded: '2026-10-09' },
  { file_name: 'concept.png', storage_path: 'concepts/c1/b1-1.png', date_uploaded: '2026-10-10' },
  { file_name: 'van.jpg', storage_path: 'c1/100-van.jpg', date_uploaded: '2026-09-02' },
  { file_name: 'owner.HEIC', storage_path: 'c1/200-owner.HEIC', date_uploaded: '2026-09-20' },
  { file_name: 'notes.pdf', storage_path: 'c1/300-notes.pdf', date_uploaded: '2026-10-11' },
]
check('the newest real photo, not an ad, a concept, the logo or a PDF', pickBackground({ files }), 'c1/200-owner.HEIC')
check('Drive when nothing is uploaded', pickBackground({ files: [files[0]], drive: [{ id: 'd1', name: 'logo.png', mime_type: 'image/png' }, { id: 'd2', name: 'crew.jpg', mime_type: 'image/jpeg' }] }), 'drive:d2')
check('nothing when there is nothing', pickBackground({ files: [], drive: [] }), '')
check('tolerates missing lists', pickBackground({}), '')

// The photo pass.
check('the prompt tells the chat to leave the colours to the logo', /Leave offer_colour and badge_colour empty/.test(p), true)
check('no photos, no photo paragraph', /Attached are/.test(p), false)
const pp = makeAdsPrompt({ count: 3, clientName: 'Prime', photos: [{ name: 'owner.jpg' }, { name: 'van.jpg' }] })
check('photos are numbered in the prompt', /Attached are 2 photos of this business, numbered in this order: 1 owner.jpg, 2 van.jpg/.test(pp), true)
check('and the JSON is asked for a photo number', /each with its "photo" number/.test(pp), true)
const pool = photoPool({
  files: [
    { file_name: 'logo.png', storage_path: 'c1/logo.png', date_uploaded: '2026-10-01' },
    { file_name: 'van.jpg', storage_path: 'c1/100-van.jpg', date_uploaded: '2026-09-02' },
    { file_name: 'ad-1-square.png', storage_path: 'ads/c1/1-square.png', date_uploaded: '2026-10-09' },
    { file_name: 'owner.HEIC', storage_path: 'c1/200-owner.HEIC', date_uploaded: '2026-09-20' },
  ],
  drive: [
    { id: 'd1', name: 'crew.jpg', mime_type: 'image/jpeg', created_time: '2026-10-05T00:00:00Z' },
    { id: 'd2', name: 'logo-white.png', mime_type: 'image/png', created_time: '2026-10-06T00:00:00Z' },
    { id: 'd3', name: 'clip.mp4', mime_type: 'video/mp4', created_time: '2026-10-07T00:00:00Z' },
    { id: 'd4', name: 'house.jpg', mime_type: 'image/jpeg', modified_time: '2026-08-01T00:00:00Z' },
  ],
})
check('the pool is uploads and Drive together, newest first, no logos, ads or clips', pool.map((x) => x.path), ['drive:d1', 'c1/200-owner.HEIC', 'c1/100-van.jpg', 'drive:d4'])
check('names travel with the pool', pool.map((x) => x.name), ['crew.jpg', 'owner.HEIC', 'van.jpg', 'house.jpg'])
check('eight photos at most are shown', BATCH_PHOTO_MAX, 8)
const three = [{ hook: 'a' }, { hook: 'b' }, { hook: 'c' }]
check('the picks are honoured', assignPhotos(three, { pool, shown: pool.slice(0, 3), picks: [3, 1, 2] }).map((s) => s.backgroundPath), ['c1/100-van.jpg', 'drive:d1', 'c1/200-owner.HEIC'])
check('no picks: a different photo each, newest first', assignPhotos(three, { pool, shown: pool, picks: [] }).map((s) => s.backgroundPath), ['drive:d1', 'c1/200-owner.HEIC', 'c1/100-van.jpg'])
check('a repeated pick moves on to an unused photo', assignPhotos(three, { pool, shown: pool, picks: [1, 1, 1] }).map((s) => s.backgroundPath), ['drive:d1', 'c1/200-owner.HEIC', 'c1/100-van.jpg'])
check('an out-of-range pick falls back', assignPhotos([{ hook: 'a' }], { pool, shown: pool.slice(0, 2), picks: [9] })[0].backgroundPath, 'drive:d1')
check('more ads than photos reuses the newest', assignPhotos([1, 2, 3].map((n) => ({ hook: String(n) })), { pool: pool.slice(0, 2), shown: pool.slice(0, 2), picks: [] }).map((s) => s.backgroundPath), ['drive:d1', 'c1/200-owner.HEIC', 'drive:d1'])
check('a set that brought its own photo keeps it', assignPhotos([{ hook: 'a', backgroundPath: 'c1/mine.jpg' }], { pool, shown: pool, picks: [1] })[0].backgroundPath, 'c1/mine.jpg')
check('an empty pool leaves the photo empty', assignPhotos(three, { pool: [], shown: [], picks: [1] }).map((s) => s.backgroundPath), ['', '', ''])

// The chips and the round trip.
check('the chip names the angle', setTitle({ hookAngle: 'Current offer', hook: 'FREE second opinion on any quote' }, 0), '1 · Current offer')
check('or the first words of the hook', setTitle({ hook: 'FREE second opinion on any quote' }, 1), '2 · FREE second opinion on')
check('or a number', setTitle({}, 2), '3 · Ad 3')
const set = { hook: 'FREE second opinion', offerAmount: 'Free', layout: 'stack', backgroundPath: 'c1/owner.jpg', hookAngle: 'Current offer', designBrief: 'owner at the door' }
const edited = snapshotSet(set, { hook: 'FREE second opinion on any quote', offerAmount: 'Free', offerDetail: 'before you sign', layout: 'plate', backgroundPath: 'c1/van.jpg', accent: '#C8102E', badgeColor: '#13294B' })
check('edits are kept on the set', [edited.hook, edited.offerDetail, edited.layout, edited.backgroundPath, edited.accent], ['FREE second opinion on any quote', 'before you sign', 'plate', 'c1/van.jpg', '#C8102E'])
check('what the Studio does not carry stays', [edited.hookAngle, edited.designBrief], ['Current offer', 'owner at the door'])
check('a missing field leaves the set alone', snapshotSet(set, { hook: 'x' }).backgroundPath, 'c1/owner.jpg')
check('ready when every set has a hook or an offer', batchReady([{ hook: 'a' }, { offerAmount: '$89' }, { offerDetail: 'tune-up' }]), true)
check('not ready with an empty set', batchReady([{ hook: 'a' }, { hook: '  ' }]), false)
check('not ready when empty', batchReady([]), false)

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
