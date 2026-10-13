// Self-check for the AI concepts brief: the words are quoted exactly, nothing
// else is allowed on the image, and the references are explained.
// Run: node scripts/check-ad-concepts.mjs

import { buildBrief, conceptPath, tradeKey } from '../supabase/functions/ad-concepts/brief.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const brief = {
  business: 'Prime Heating & Cooling',
  industry: 'HVAC',
  market: 'Manchester, NH',
  hook: 'FREE second opinion on HVAC repair and replacement quotes over $500',
  offerAmount: 'Free',
  offerDetail: 'second opinion before you commit',
  subhead: 'Before you commit, get a second opinion.',
  proof: '4.9 on Google, 312 reviews',
  badge: 'Manchester',
  accent: '#C8102E',
  badgeColor: '#13294B',
  hasLogo: true,
  photoCount: 2,
}
const out = buildBrief(brief, { count: 4, today: new Date('2026-10-13') })

check('asks for the batch size, the trade and the market', /Create 4 distinct.*Prime Heating & Cooling, a hvac company serving Manchester, NH/.test(out.prompt), true)
check('the headline is quoted exactly', out.prompt.includes('Headline, exactly these words: "FREE second opinion on HVAC repair and replacement quotes over $500".'), true)
check('the offer joins amount and detail', out.prompt.includes('Offer, exactly: "Free second opinion before you commit"'), true)
check('the business name is spelled out', out.prompt.includes('The business name "Prime Heating & Cooling", spelled exactly like that'), true)
check('nothing else may be written on the image', /no phone number, no website, no address/.test(out.prompt), true)
check('autumn light in October', /autumn, orange leaves/.test(out.prompt), true)
check('the brand colours and the giant word', out.prompt.includes('one giant accent word in #C8102E') && out.prompt.includes('brand colours #C8102E and #13294B'), true)
check('the logo and the photos are explained', /first reference image is the logo/.test(out.prompt) && /other reference images are real photos of this business/.test(out.prompt), true)
check('each concept is a different scene and arrangement', /different scene and a different arrangement/.test(out.prompt), true)
check('niche and audience are set', [out.niche, /Homeowners in Manchester, NH/.test(out.target_audience), out.language], ['Hvac (local service business)', true, 'en'])

const bare = buildBrief({ business: 'Dale’s Plumbing', industry: 'Plumbing', hook: 'No hot water?' }, { count: 2, today: new Date('2026-06-02') })
check('no references: a believable technician is invented, no brand names', /No reference images: invent a believable technician/.test(bare.prompt), true)
check('summer light in June', /high summer/.test(bare.prompt), true)
check('a quote inside the words is softened, not escaped', buildBrief({ business: 'X', hook: 'Say "yes" to heat' }).prompt.includes('"Say ”yes” to heat"'), true)
check('batch is clamped to 1 to 8', [/Create 1 /.test(buildBrief({ business: 'X', hook: 'h' }, { count: 0 }).prompt), /Create 8 /.test(buildBrief({ business: 'X', hook: 'h' }, { count: 20 }).prompt)], [true, true])
check('trades from intake words', ['HVAC/Plumbing', 'Roofing', 'Water treatment', 'Landscape design', ''].map(tradeKey), ['hvac', 'roofing', 'plumbing', 'landscaping', 'general'])
check('concept images never live under the saved-ads prefix', conceptPath('c1', 'abc', 0), 'concepts/c1/abc-1.png')

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
