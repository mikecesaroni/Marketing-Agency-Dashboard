// Self-check for the logo knock-out: the box goes whatever its colour, the
// holes inside letters go, lettering inside a badge stays, and a picture
// with no box is left alone.
// Run: node scripts/check-logo-cutout.mjs
import { readFileSync } from 'node:fs'
import { borderColour, knockOut } from '../src/lib/logoCutout.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// A tiny RGBA canvas: fill, rectangles, rings.
const canvas = (w, h, [r, g, b]) => {
  const px = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) px.set([r, g, b, 255], i * 4)
  return { w, h, px }
}
const rect = (c, x0, y0, x1, y1, rgb) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) c.px.set([...rgb, 255], (y * c.w + x) * 4)
}
const alphaAt = (c, x, y) => c.px[(y * c.w + x) * 4 + 3]
const WHITE = [255, 255, 255]
const BLACK = [12, 12, 12]
const RED = [200, 40, 40]

// 1. Black "o" (a square ring) on white: the box and the hole both go, the ring stays.
{
  const c = canvas(60, 60, WHITE)
  rect(c, 15, 15, 45, 45, BLACK)
  rect(c, 23, 23, 37, 37, WHITE)
  const bg = borderColour(c.px, c.w, c.h)
  check('a white box is the background, all of the border', [Math.round(bg.r), Math.round(bg.share * 100)], [255, 100])
  knockOut(c.px, c.w, c.h, bg)
  check('the box goes, the ring stays, the hole in the letter goes', [alphaAt(c, 2, 2), alphaAt(c, 18, 18), alphaAt(c, 30, 30)], [0, 255, 0])
}

// 2. White lettering inside a red badge on white: the white outside goes, the
//    long thin white strokes inside stay (they are the words, not holes).
{
  const c = canvas(120, 60, WHITE)
  rect(c, 10, 10, 110, 50, RED)
  rect(c, 20, 20, 24, 42, WHITE) // an I
  rect(c, 30, 20, 34, 42, WHITE) // another I
  rect(c, 30, 20, 50, 24, WHITE) // the top bar of an F
  const bg = borderColour(c.px, c.w, c.h)
  knockOut(c.px, c.w, c.h, bg)
  check('lettering inside a badge stays', [alphaAt(c, 1, 1), alphaAt(c, 22, 30), alphaAt(c, 40, 22), alphaAt(c, 60, 30)], [0, 255, 255, 255])
}

// 3. A black square around an orange mark: a dark box is a box too.
{
  const c = canvas(50, 50, BLACK)
  rect(c, 15, 15, 35, 35, [249, 115, 22])
  const bg = borderColour(c.px, c.w, c.h)
  check('a black box counts as the background', bg.share > 0.9 && bg.r < 30, true)
  knockOut(c.px, c.w, c.h, bg)
  check('the black goes, the mark stays', [alphaAt(c, 3, 3), alphaAt(c, 25, 25)], [0, 255])
}

// 4. A border with no shared colour (a picture) is not a box.
{
  const c = canvas(40, 40, WHITE)
  for (let x = 0; x < 40; x++) for (let y = 0; y < 40; y++) c.px.set([(x * 6) % 256, (y * 6) % 256, ((x + y) * 3) % 256, 255], (y * 40 + x) * 4)
  const bg = borderColour(c.px, c.w, c.h)
  check('a picture has no shared border colour', bg.share < 0.55, true)
}

// 5. A PNG cut out already is reported as such.
{
  const c = canvas(30, 30, WHITE)
  for (let i = 3; i < c.px.length; i += 4) c.px[i] = 0
  rect(c, 10, 10, 20, 20, BLACK)
  check('a transparent border means cut out already', borderColour(c.px, c.w, c.h).alreadyCut, true)
}

// The photo looks paint the knocked-out logo, not the original on a pill.
const looks = readFileSync(new URL('../src/lib/adLooks.js', import.meta.url), 'utf8')
check('the photo looks hand the assets to the logo painter, which picks the cut mark', [looks.split('drawLogoPill(ctx, assets,').length - 1, /logoFor\(assetsOrLogo, true\)/.test(looks), /rgba\(255,255,255,0\.92\)/.test(looks)], [2, true, false])

console.log(failures === 0 ? '\nAll logo cutout checks pass' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
