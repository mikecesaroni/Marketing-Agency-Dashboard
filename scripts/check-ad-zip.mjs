// Naming and packing the three ad sizes.
//
// Boring-looking code that is worth pinning down, because every failure here
// is silent: a zip with a duplicate entry loses all but one of them, a zip
// containing an empty PNG looks like a download that worked, and a filename
// derived three slightly different ways gives you a set that does not look
// like a set.
//
// Run with: node scripts/check-ad-zip.mjs

import { adFileName, slug, zipAdSizes, zipFileName } from '../src/lib/adZip.js'

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`PASS  ${name}`)
  else {
    failures++
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// --- names ----------------------------------------------------------------
check('a client name becomes a filename stem', slug('Belk Heating and Cooling') === 'belk-heating-and-cooling')
check('an ampersand does not leave a stray dash pair', slug('Belk Heating & Cooling') === 'belk-heating-cooling', slug('Belk Heating & Cooling'))
check('punctuation at the ends is trimmed, not turned into dashes', slug("Tito's Appliances ") === 'tito-s-appliances', slug("Tito's Appliances "))
check('a missing name still produces a usable file', slug(null) === 'client' && slug('') === 'client')
check('the PNG is named client-size', adFileName('MBD Pressure Washing', 'story') === 'mbd-pressure-washing-story.png')

const zipName = zipFileName('Plumbquick', new Date(2026, 8, 2))
check('the archive is dated so two downloads do not collide', zipName === 'plumbquick-ads-2026-09-02.zip', zipName)
check('a millisecond stamp works as well as a Date', zipFileName('Acme', new Date(2026, 0, 5).getTime()) === 'acme-ads-2026-01-05.zip')
check('a bad stamp falls back to today rather than NaN', /^acme-ads-\d{4}-\d{2}-\d{2}\.zip$/.test(zipFileName('Acme', 'rubbish')))

// --- packing --------------------------------------------------------------
// Real bytes, in the two shapes the app actually produces: a canvas hands over
// a Blob (an object with arrayBuffer()), a fetch hands over a Response body.
// JSZip refuses Node's Blob, which is exactly why zipAdSizes normalises first
// -- so this can pass the browser's shape and have it work.
const fakeBlob = (bytes) => {
  const data = new Uint8Array(bytes)
  return { size: bytes, arrayBuffer: async () => data.buffer }
}
const rawBytes = (bytes) => new Uint8Array(bytes)

const three = await zipAdSizes({
  clientName: 'Acme Air',
  entries: [
    { sizeKey: 'square', blob: fakeBlob(10) },
    { sizeKey: 'feed', blob: fakeBlob(11) },
    { sizeKey: 'story', blob: fakeBlob(12) },
  ],
})
check('all three go in', three.names.length === 3, three.names.join(','))
check(
  'in the order they were given, which is the order the Studio shows them',
  three.names.join(',') === 'acme-air-square.png,acme-air-feed.png,acme-air-story.png',
  three.names.join(',')
)
check(
  'and it produces an archive',
  three.blob !== null && (three.blob.size || three.blob.byteLength) > 0
)
check(
  'a typed array works as well as a Blob, so no caller has to convert first',
  (await zipAdSizes({ clientName: 'Acme', entries: [{ sizeKey: 'square', blob: rawBytes(8) }] })).names
    .join(',') === 'acme-square.png'
)

const withEmpty = await zipAdSizes({
  clientName: 'Acme',
  entries: [
    { sizeKey: 'square', blob: fakeBlob(10) },
    { sizeKey: 'feed', blob: fakeBlob(0) },
    { sizeKey: 'story', blob: null },
    { sizeKey: 'extra' },
  ],
})
check(
  'an empty or missing size is left out, not written as a 0-byte PNG',
  withEmpty.names.join(',') === 'acme-square.png',
  withEmpty.names.join(',')
)

const dupes = await zipAdSizes({
  clientName: 'Acme',
  entries: [
    { sizeKey: 'square', blob: fakeBlob(10) },
    { sizeKey: 'square', blob: fakeBlob(11) },
    { sizeKey: 'square', blob: fakeBlob(12) },
  ],
})
check(
  'a repeated size is numbered rather than silently overwritten',
  dupes.names.join(',') === 'acme-square.png,acme-square-2.png,acme-square-3.png',
  dupes.names.join(',')
)
check('so nothing is lost', dupes.names.length === 3)

const none = await zipAdSizes({ clientName: 'Acme', entries: [] })
check('nothing to pack means no archive rather than an empty one', none.blob === null && none.names.length === 0)
check('no arguments does not throw', (await zipAdSizes({})).blob === null)

if (failures > 0) {
  console.error(`\nad-zip checks FAILED (${failures})`)
  process.exit(1)
}
console.log('\nAll ad-zip checks passed')
