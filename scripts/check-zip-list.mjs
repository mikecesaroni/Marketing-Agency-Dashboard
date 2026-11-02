// Self-check for the pasted ZIP list. Run: node scripts/check-zip-list.mjs
//
// The rule: WHATEVER A CLIENT PASTES, THE FIVE-DIGIT ZIPS COME OUT ONCE EACH,
// IN ORDER, AND META SAYS WHICH ONES ARE REAL.

import { MAX_ZIPS, pasteSummary, zipKey, zipLocation, zipsFromText } from '../src/lib/zipList.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

check('commas, spaces and newlines all separate', zipsFromText('27601, 27603 27605\n27609'), ['27601', '27603', '27605', '27609'])
check('a client email with words around the numbers', zipsFromText('Hi, we cover Raleigh NC 27601 and Cary 27511 plus 27513. Thanks!'), ['27601', '27511', '27513'])
check('ZIP+4 is the five', zipsFromText('27605-1234'), ['27605'])
check('a leading zero stays', zipsFromText('02134 02135'), ['02134', '02135'])
check('a phone number or a longer run of digits is not a ZIP', zipsFromText('call 9195551234 or 919-555-1234, zip 27601'), ['27601'])
check('duplicates once, first position kept', zipsFromText('27601 27603 27601'), ['27601', '27603'])
check('a spreadsheet column pasted with tabs and blank lines', zipsFromText('ZIP\t\n27601\t\n\n27603\t\n'), ['27601', '27603'])
check('nothing in, nothing out', [zipsFromText(''), zipsFromText(null), zipsFromText('no zips here 1234 123456')], [[], [], []])
check('capped', zipsFromText(Array.from({ length: MAX_ZIPS + 50 }, (_, i) => String(10000 + i)).join(' ')).length, MAX_ZIPS)

check("Meta's key for a US ZIP", [zipKey('27601'), zipKey(' 27601 '), zipKey('27601', 'CA')], ['US:27601', 'US:27601', 'CA:27601'])
check('a Meta row as a picker location, labelled with its town and state, no radius', zipLocation({ key: 'US:27601', name: '27601', type: 'zip', primary_city: 'Raleigh', region: 'North Carolina', country_code: 'US', country_name: 'United States' }), { key: 'US:27601', type: 'zip', name: '27601', region: 'North Carolina', country_code: 'US', country_name: 'United States', label: '27601, Raleigh, North Carolina' })
check('a row with no town still labels', zipLocation({ key: 'US:00501', name: '00501', region: 'New York' }).label, '00501, New York')

check('the summary: added, already there, not known', pasteSummary({ added: 40, already: 1, missing: ['00000'] }), 'Added 40 ZIPs · 1 already there · 1 not known to Meta: 00000.')
check('one ZIP reads singular', pasteSummary({ added: 1 }), 'Added 1 ZIP.')
check('nothing found says so', pasteSummary({}), 'No ZIP codes found in what was pasted.')
check('a long missing list is cut', pasteSummary({ missing: Array.from({ length: 15 }, (_, i) => String(99900 + i)) }).endsWith(', 99911 and 3 more.'), true)

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll ZIP list checks passed')
