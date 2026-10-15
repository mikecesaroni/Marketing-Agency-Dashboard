// Self-check for the overlap audit. Run: node scripts/check-ad-audit.mjs

import { auditLine, createAudit } from '../src/lib/adAudit.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const a = createAudit({ w: 1080, h: 1350 })
a.add('badge', { x: 60, y: 60, w: 300, h: 52 }, 'the location badge')
a.add('text', { x: 200, y: 80, w: 600, h: 120 }, 'the kicker')
a.add('text', { x: 60, y: 300, w: 900, h: 200 }, 'the headline')
a.add('photo', { x: 0, y: 0, w: 1080, h: 700 }, 'the photo')
a.add('panel', { x: 0, y: 700, w: 1080, h: 650 }, 'the plate')
a.add('logo', { x: 900, y: 1300, w: 200, h: 80 }, 'the logo')
a.add('text', { x: 0, y: 0, w: 0, h: 0 }, 'nothing')
a.add('text', { x: NaN, y: 0, w: 10, h: 10 }, 'junk')
const p = a.problems()
check('the badge over the kicker is flagged', p.filter((x) => x.type === 'overlap').map((x) => [x.a, x.b]), [['the location badge', 'the kicker']])
check('a logo past the right edge is flagged', p.filter((x) => x.type === 'edge').map((x) => x.a), ['the logo'])
check('photos and panels are surfaces, never flagged', p.some((x) => /photo|plate/.test(x.text)), false)
check('empty and junk boxes are ignored', a.boxes.length, 6)

const b = createAudit({ w: 1080, h: 1080 })
b.add('text', { x: 60, y: 60, w: 400, h: 100 }, 'a')
b.add('text', { x: 456, y: 60, w: 400, h: 100 }, 'b')
b.add('sticker', { x: 60, y: 164, w: 100, h: 100 }, 'c')
check('touching and rounded-corner grazes do not count', b.problems(), [])

check('the line names the first two and counts the rest', auditLine([{ text: 'a and b overlap' }, { text: 'c runs past the edge of the frame' }, { text: 'd and e overlap' }], 'Story'), 'Story: a and b overlap; c runs past the edge of the frame and 1 more. Shorten the words, pick another template, or ask the chat to rewrite.')
check('no problems, no line', auditLine([]), '')

console.log(failures ? `\n${failures} check(s) failed` : '\nAll audit checks pass')
process.exit(failures ? 1 : 0)
