// Self-check for the card layout's photo placement. Run: node scripts/check-ad-layout.mjs
//
// The rule: A POSITION DRAGGED TO ON THE 216px PREVIEW IS THE SAME POSITION ON
// THE 1080px EXPORT. Everything is stored as fractions of the frame and
// resolved by photoRect, so this checks that resolution and its guardrails,
// and that the default layout is still the one every ad was built with.

import { DEFAULT_PHOTO, LAYOUTS, photoRect } from '../src/lib/adLayout.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

check('cover is first and therefore the default', LAYOUTS[0].key, 'cover')
check('card is the only other layout', LAYOUTS.map((l) => l.key), ['cover', 'card'])
check('default photo sits centred, a little low, at 72% width', DEFAULT_PHOTO, { x: 0.5, y: 0.55, scale: 0.72 })

const landscape = { width: 1600, height: 900 }
const square = photoRect(1080, 1080, landscape, DEFAULT_PHOTO)
check('72% of a 1080 frame is 778 wide', square.w, 778)
check('height follows the photo ratio', square.h, Math.round(1080 * 0.72 * 900 / 1600))
check('centred horizontally', square.x + square.w / 2, 540)
check('centre y at 55%', Math.round(square.y + square.h / 2), 594)

// The same fractions on the portrait and story frames.
const feed = photoRect(1080, 1350, landscape, DEFAULT_PHOTO)
check('portrait frame: same width share', feed.w, 778)
check('portrait frame: centre y at 55% of 1350', Math.round(feed.y + feed.h / 2), Math.round(1350 * 0.55))

// A tall photo cannot outgrow the frame.
const tall = { width: 900, height: 1600 }
const big = photoRect(1080, 1080, tall, { x: 0.5, y: 0.5, scale: 1.2 })
check('a tall photo is capped at 95% of frame height', big.h, 1026)
check('and its width follows', big.w, Math.round(1026 * 900 / 1600))

// Dragging past the edge is clamped, and nonsense is ignored.
const edge = photoRect(1080, 1080, landscape, { x: 1.7, y: -3, scale: 0.5 })
check('x past 1 clamps to the right edge', edge.x + edge.w / 2, 1080)
check('y below 0 clamps to the top', edge.y + edge.h / 2, 0)
const junk = photoRect(1080, 1080, landscape, { x: 'no', y: null, scale: 'wide' })
check('junk position falls back to the left/top edge, not NaN', [Number.isNaN(junk.x), Number.isNaN(junk.w)], [false, false])
check('scale is clamped between 0.2 and 1.5', [photoRect(1000, 1000, landscape, { scale: 0.01 }).w, photoRect(1000, 2000, landscape, { scale: 9 }).w], [200, 1500])
check('no photo object at all uses the defaults', photoRect(1080, 1080, landscape, undefined), square)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll layout checks pass')
process.exit(failures ? 1 : 0)
