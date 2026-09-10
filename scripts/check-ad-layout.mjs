// Self-check for the card layout's photo placement. Run: node scripts/check-ad-layout.mjs
//
// The rule: THE PHOTO LIVES IN THE FREE BAND BETWEEN THE HEADLINE AND THE
// OFFER BLOCK, ON EVERY FRAME. A position is stored as a share of that band,
// not of the frame, because the band is half a square feed ad and well under
// half a Stories frame: a frame share that looked right on the square put the
// photo over the offer block on Stories. Everything resolves through
// photoRect, so the 216px preview and the 1080px export agree.

import { DEFAULT_FOCUS, DEFAULT_PHOTO, LAYOUTS, coverRect, dragFocus, dragPhoto, photoRect } from '../src/lib/adLayout.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

check('cover is first and therefore the default', LAYOUTS[0].key, 'cover')
check('card is the only other layout', LAYOUTS.map((l) => l.key), ['cover', 'card'])
check('default photo sits centred in the band at 72% width', DEFAULT_PHOTO, { x: 0.5, y: 0.5, scale: 0.72 })

const landscape = { width: 1600, height: 900 }

// A square feed frame: text ends around 330, the offer block starts at 800.
const squareBand = { top: 330, bottom: 830 }
const square = photoRect(1080, 1080, landscape, DEFAULT_PHOTO, squareBand)
check('72% of a 1080 frame is 778 wide', square.w, 778)
check('height follows the photo ratio', square.h, Math.round(1080 * 0.72 * 900 / 1600))
check('centred horizontally', square.x + square.w / 2, 540)
check('centre y is the middle of the band, not the frame', Math.round(square.y + square.h / 2), 580)
check('the photo clears the text above', square.y >= squareBand.top, true)
check('and the offer block below', square.y + square.h <= squareBand.bottom, true)

// The Stories frame: Meta's UI takes the top 270 and bottom 672, so the band
// is high and short. The same saved position must land inside it.
const storyBand = { top: 690, bottom: 1030 }
const story = photoRect(1080, 1920, landscape, DEFAULT_PHOTO, storyBand)
check('stories: the photo shrinks to fit a short band', story.h, Math.round(340 * 0.95))
check('stories: it still sits inside the band', [story.y >= storyBand.top, story.y + story.h <= storyBand.bottom], [true, true])
check('stories: nowhere near the offer block at 1030+', story.y + story.h <= 1030, true)

// A tall photo cannot outgrow the band.
const tall = { width: 900, height: 1600 }
const big = photoRect(1080, 1080, tall, { x: 0.5, y: 0.5, scale: 1.2 }, squareBand)
check('a tall photo is capped at 95% of the band', big.h, 475)
check('and its width follows', big.w, Math.round(475 * 900 / 1600))

// Dragging past the edge is clamped, and nonsense is ignored.
const edge = photoRect(1080, 1080, landscape, { x: 1.7, y: -3, scale: 0.5 }, squareBand)
check('x past 1 clamps to the right edge', edge.x + edge.w / 2, 1080)
check('y below 0 clamps to the top of the band', edge.y + edge.h / 2, squareBand.top)
const junk = photoRect(1080, 1080, landscape, { x: 'no', y: null, scale: 'wide' }, squareBand)
check('junk position is never NaN', [Number.isNaN(junk.x), Number.isNaN(junk.y), Number.isNaN(junk.w)], [false, false, false])
check('scale is clamped between 0.2 and 1.5', [photoRect(1000, 1000, landscape, { scale: 0.01 }).w, photoRect(1000, 2000, landscape, { scale: 9 }).w], [200, 1500])
const whole = photoRect(1080, 1080, landscape, DEFAULT_PHOTO)
check('no band means the whole frame', Math.round(whole.y + whole.h / 2), 540)
check('no photo object at all uses the defaults', photoRect(1080, 1080, landscape, undefined, squareBand), square)

// A drag on the preview moves the photo by the same amount the pointer moved.
// dy arrives as a share of the frame height; the band is shorter, so it scales.
const moved = dragPhoto(DEFAULT_PHOTO, 0.1, 0.05, 1920, storyBand)
check('x moves by the frame share', moved.x, 0.6)
check('y moves by the band share: 96px of a 340px band', Math.round(moved.y * 1000) / 1000, Math.round((0.5 + 96 / 340) * 1000) / 1000)
check('a drag is clamped to the band', dragPhoto(DEFAULT_PHOTO, 0.9, -0.9, 1080, squareBand), { x: 1, y: 0, scale: 0.72 })
check('a drag before the first paint still works', dragPhoto(DEFAULT_PHOTO, 0.1, 0.1, 1080, undefined).y, 0.6)
check('scale is carried through a drag', dragPhoto({ x: 0.5, y: 0.5, scale: 1.1 }, 0, 0, 1080, squareBand).scale, 1.1)

// --- cover layout focal point ---------------------------------------------------

// A portrait of two people, 1080x1620, in a square frame: scaled to 1080 wide,
// 1620 tall, 540 of overflow. Centred by default, so the top 270px (their
// heads) is cut.
const portrait = { width: 1080, height: 1620 }
check('default focus is the centre', DEFAULT_FOCUS, { x: 0.5, y: 0.5 })
const centred = coverRect(1080, 1080, portrait, DEFAULT_FOCUS)
check('cover: scaled to fill, overflow split evenly', centred, { x: 0, y: -270, w: 1080, h: 1620 })
// Focus on the faces, a third of the way down the photo: the crop starts at the top.
const faces = coverRect(1080, 1080, portrait, { x: 0.5, y: 0.333 })
check('focus near the top shows the top of the photo', faces.y, 0)
check('and never leaves a gap below', faces.y + faces.h >= 1080, true)
check('focus at the very bottom clamps so the frame stays covered', coverRect(1080, 1080, portrait, { x: 0.5, y: 1 }).y, -540)
// The same focus on the Stories frame (1080x1920): the photo is scaled to
// 1920 tall, 1280 wide; y has no overflow and x barely does.
const storyCover = coverRect(1080, 1920, portrait, { x: 0.5, y: 0.333 })
check('stories: no vertical overflow means y is 0 whatever the focus', storyCover.y, 0)
check('stories: the width overflow is centred', storyCover.x, -100)
check('cover: junk focus is never NaN', Object.values(coverRect(1080, 1080, portrait, { x: 'a', y: null })).some(Number.isNaN), false)
check('cover: no image falls back to the frame', coverRect(1080, 1080, null, DEFAULT_FOCUS), { x: 0, y: 0, w: 1080, h: 1080 })

// Dragging the square preview down by a quarter of its height moves the photo
// down 270px, i.e. the focus up the photo by 270/1620.
const dragged = dragFocus(DEFAULT_FOCUS, 0, 0.25, 1080, 1080, portrait)
check('drag down moves the focus up the photo', Math.round(dragged.y * 1000), Math.round((0.5 - 270 / 1620) * 1000))
check('drag down leaves x alone', dragged.x, 0.5)
check('the dragged focus shows the top of the photo', coverRect(1080, 1080, portrait, dragged).y, 0)
// Dragging further down cannot bank movement: the focus stops where the crop stops.
const over = dragFocus(dragged, 0, 0.5, 1080, 1080, portrait)
check('over-drag clamps at the edge of the useful range', Math.round(over.y * 1000), Math.round((540 / 1620) * 1000))
check('no horizontal overflow means x does not move', dragFocus(DEFAULT_FOCUS, 0.3, 0, 1080, 1080, portrait).x, 0.5)
check('a drag is applied on top of an existing focus', dragFocus({ x: 0.5, y: 0.4 }, 0, -0.1, 1080, 1080, portrait).y > 0.4, true)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll layout checks pass')
process.exit(failures ? 1 : 0)
