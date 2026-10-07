// Self-check for "Send to Meta library". Run: node scripts/check-meta-library.mjs
import { libraryImages, libraryLine, libraryStatus } from '../src/lib/metaLibrary.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const set = {
  stamp: '1759800000000',
  ordered: [
    { size: { key: 'square' }, file: { storage_path: 'ads/c1/1759800000000-square.png' } },
    { size: { key: 'feed' }, file: { storage_path: 'ads/c1/1759800000000-feed.png' } },
    { size: { key: 'story' }, file: null },
  ],
}
check('images by size, only the sizes that saved', libraryImages(set), { square: 'ads/c1/1759800000000-square.png', feed: 'ads/c1/1759800000000-feed.png' })
check('no set, no images', libraryImages(null), {})
check('not sent yet', libraryStatus({ meta_image_hashes: null, meta_library_at: null }), { sent: false, at: null, sizes: [] })
check('sent, with sizes', libraryStatus({ meta_image_hashes: { square: 'h1', feed: 'h2' }, meta_library_at: '2026-10-07T18:00:00Z' }).sizes, ['square', 'feed'])
check('a line for the gallery', libraryLine({ meta_image_hashes: { square: 'h1' }, meta_library_at: '2026-10-07T18:00:00Z' }, new Date('2026-10-08T00:00:00Z')).startsWith('In Meta library since '), true)
check('no line when not sent', libraryLine(null), '')

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
