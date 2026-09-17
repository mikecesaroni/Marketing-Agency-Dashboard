// Self-check for choosing a client's Facebook Page. Run: node scripts/check-pick-page.mjs
//
// The rule: NEVER GUESS A PAGE FROM LIST ORDER. Ads already using a Page
// decide; failing that, a matching name; failing that, leave it blank.

import { nameScore, pickPage } from '../src/lib/pickPage.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

// The live list, the day Perfect Breeze was wired to Tito's Page.
const pages = [
  { id: '1300608046464638', name: 'Tito’s Appliances ', ads_using: 0 },
  { id: '1222300537640645', name: 'Summit Water Pros', ads_using: 0 },
  { id: '1240627559130951', name: 'MBD Pressure washing ', ads_using: 0 },
  { id: '1101486673058902', name: 'Pillar HVAC Services', ads_using: 0 },
  { id: '1010097508860034', name: 'Horizon Water Co', ads_using: 0 },
  { id: '1036816762840249', name: 'Belk Heating & Cooling', ads_using: 0 },
  { id: '369396186258733', name: 'Active Air', ads_using: 0 },
  { id: '309785528881766', name: 'Dynamic Flow, Inc.', ads_using: 0 },
  { id: '113420158466539', name: 'Horizon HVAC', ads_using: 0 },
  { id: '104101929288032', name: 'Perfect Breeze', ads_using: 0 },
  { id: '756448844499117', name: 'Plumb Quick Company', ads_using: 0 },
]

check('Perfect Breeze LLC gets Perfect Breeze, not the first row', pickPage('Perfect Breeze LLC', pages), '104101929288032')
check('Tito Appliances gets Tito’s', pickPage('Tito Appliances', pages), '1300608046464638')
check('Active Air Heating and Cooling gets Active Air', pickPage('Active Air Heating and Cooling', pages), '369396186258733')
check('Dynamic Flow gets Dynamic Flow, Inc.', pickPage('Dynamic Flow', pages), '309785528881766')
check('Plumbquick matches Plumb Quick Company once spaces are gone', pickPage('Plumbquick', pages), '756448844499117')
check('Belk Heating and Cooling gets Belk', pickPage('Belk Heating and Cooling', pages), '1036816762840249')
check('Horizon Water Co picks Water, not HVAC', pickPage('Horizon Water Co', pages), '1010097508860034')
check('MCL Construction has no Page here: blank, not a guess', pickPage('MCL Construction', pages), null)
check('Luccia Brother Mechanicle: blank', pickPage('Luccia Brother Mechanicle', pages), null)

// Evidence from ads beats a name.
check('a Page the ads already use wins whatever it is called', pickPage('Perfect Breeze LLC', [{ id: 'x', name: 'Something Else', ads_using: 3 }, ...pages]), 'x')
check('exactly one Page is the answer', pickPage('Anything', [{ id: 'only', name: 'Unrelated Name', ads_using: 0 }]), 'only')
check('a tie between two equally good names is blank', pickPage('Horizon', [{ id: 'a', name: 'Horizon Water Co' }, { id: 'b', name: 'Horizon HVAC' }]), null)
check('brand words outweigh trade words', nameScore('Active Air Heating and Cooling', 'Active Air') > nameScore('Active Air Heating and Cooling', 'Belk Heating & Cooling'), true)
check('no pages', pickPage('X', []), null)
check('stop words do not match on their own', nameScore('The Company LLC', 'Company Inc'), 0)

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
