// Self-check for the stock library's client-photo picks. Run: node scripts/check-stock.mjs

import { photoScore, stockName } from '../src/lib/stockPick.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

check('equipment by name scores highest', ['rooftop-condenser-portrait.jpg', 'Mini-split-install.png', 'Tank to tankless.jpg', 'AC Install.jpg', 'new furnace.jpeg'].map(photoScore), [2, 2, 2, 2, 2])
check('a truck, a crew or a job scores next', ['Branded Truck.jpg', 'technitionOnJob.jpg', 'brian truck selfie.jpg', 'SittingOnTruck.jpg'].map(photoScore), [1, 1, 1, 1])
check('anything else scores nothing', ['IMG_0493.jpg', '19823.png'].map(photoScore), [0, 0])
check('finished ads, logos and iPhone HEICs are out', ['belk-before-after-4x5.png', 'pq-van-trust-1x1.png', 'company-logo.png', 'AC Install.HEIC', 'Screenshot 2026.png', ''].map(photoScore), [-1, -1, -1, -1, -1, -1])
check('a library name is clean and carries no stamp', [stockName('1791995177054-classic-photo3-rooftop-condenser-portrait.jpg'), stockName('AC with truck.JPG'), stockName('')], ['classic-photo3-rooftop-condenser-portrait.jpg', 'ac-with-truck.jpg', 'photo'])

console.log(failures ? `\n${failures} check(s) failed` : '\nAll stock checks pass')
process.exit(failures ? 1 : 0)
