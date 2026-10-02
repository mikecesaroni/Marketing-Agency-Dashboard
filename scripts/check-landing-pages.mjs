// Self-check for the landing pages arithmetic. Run: node scripts/check-landing-pages.mjs
import { guessPurpose, labelFromUrl, landingPagesBlock, normalizeUrl, pagesForMetaLink, pagesText, pageTitle, shortUrl, sortPages } from '../src/lib/landingPages.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

check('a bare domain and path gets https', normalizeUrl('workingclassgroup.com/dynamic-flow'), 'https://workingclassgroup.com/dynamic-flow')
check('a full link is kept, UTM and all', normalizeUrl('https://x.com/p?utm_source=facebook&utm_medium=paid'), 'https://x.com/p?utm_source=facebook&utm_medium=paid')
check('words are not an address', [normalizeUrl('dynamic flow'), normalizeUrl(''), normalizeUrl('localhost'), normalizeUrl('ftp://x.com/a')], ['', '', '', ''])
check('shortUrl drops scheme, www and the trailing slash', shortUrl('https://www.workingclassgroup.com/reliable-heating-and-cooling/'), 'workingclassgroup.com/reliable-heating-and-cooling')
check('label from the last path segment', labelFromUrl('workingclassgroup.com/reliable-heating-and-cooling'), 'Reliable Heating And Cooling')
check('label keeps short words upper case and drops .html', labelFromUrl('https://x.com/hvac-tune-up.html'), 'HVAC Tune Up')
check('label for a bare domain is the domain', labelFromUrl('https://www.reliableheatandair.com/'), 'reliableheatandair.com')
check('purpose guesses', [guessPurpose('https://x.com/book-now'), guessPurpose('https://x.com/p?utm_source=facebook'), guessPurpose('https://x.com/p?gclid=abc'), guessPurpose('https://x.com/p')], ['booking', 'meta', 'google', ''])

const pages = [
  { id: '1', url: 'https://x.com/book', purpose: 'booking', label: '', notes: '', created_at: '2026-09-01' },
  { id: '2', url: 'https://x.com/google-lp', purpose: 'google', label: 'Search page', notes: 'AW tag on it', created_at: '2026-09-02' },
  { id: '3', url: 'https://x.com/meta-b', purpose: 'meta', label: '', notes: '', created_at: '2026-09-03' },
  { id: '4', url: 'https://x.com/meta-a', purpose: 'meta', label: '', notes: '', created_at: '2026-09-01' },
  { id: '5', url: 'https://x.com/', purpose: 'site', label: '', notes: '', created_at: '2026-09-01' },
]
check('sorted by purpose then oldest first', sortPages(pages).map((p) => p.id), ['4', '3', '2', '1', '5'])
check('a title is the label, else made from the link', [pageTitle(pages[1]), pageTitle(pages[0])], ['Search page', 'Book'])
check('copy-all text', pagesText('Dynamic Flow', pages.slice(0, 2)).split('\n'), ['Dynamic Flow landing pages', '- Search page (Google Ads): https://x.com/google-lp  AW tag on it', '- Book (Booking): https://x.com/book'])
check('copy-all with nothing says so', pagesText('X', []), 'X: no landing pages saved yet.')
check('the brief block names each page by purpose', landingPagesBlock(pages.slice(1, 3)).split('\n'), ['=== LANDING PAGES (where the ads send people) ===', 'Meta ads: https://x.com/meta-b', 'Google Ads: https://x.com/google-lp (Search page). AW tag on it'])
check('no pages, no block', landingPagesBlock([]), '')
check('Meta link choices: Meta pages first, booking left out', pagesForMetaLink(pages).map((p) => p.id), ['4', '3', '5', '2'])

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
