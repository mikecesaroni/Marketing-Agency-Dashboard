// Self-check for the website reader: which address it trusts, what it keeps
// from a page, and which pages it bothers to open.
// Run: node scripts/check-read-website.mjs

import { shouldAutoRead, websiteBlock } from '../src/lib/websiteProfile.js'
import { markdownLinks, markdownToText, parseRendered, htmlToText, isPublicHost, pageMeta, pickPages, pickWebsite, sameSiteLinks, siteUrl } from '../supabase/functions/read-website/index.ts'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

check('addresses as typed in the intake',
  ['activeairms.com', 'Perfectbreezehvac.com ', 'https://www.comfortexpertsny.com/', 'https://horizonhvacinc.com/free-estimate'].map(siteUrl),
  ['https://activeairms.com/', 'https://perfectbreezehvac.com/', 'https://www.comfortexpertsny.com/', 'https://horizonhvacinc.com/free-estimate'])
check('street addresses and junk are not websites', ['1569 Bonner Rd', '2211 NW 21st Pl', '', null, 'n/a'].map(siteUrl), ['', '', '', '', ''])
check('never the machine\'s own network',
  ['localhost', '127.0.0.1', '10.0.0.5', '192.168.1.1', '172.20.0.1', '169.254.169.254', 'db.internal', 'belkhvac.com', '8.8.8.8'].map(isPublicHost),
  [false, false, false, false, false, false, false, true, true])
check('the GHL street address is skipped for the next real site', pickWebsite([null, '', '1569 Bonner Rd', 'activeairms.com']), 'https://activeairms.com/')

const html = `<html><head><title>Belk Heating &amp; Cooling | Austin AC Repair</title>
<meta name="description" content="Family owned since 2009.">
<script type="application/ld+json">{"@type":"HVACBusiness","telephone":"512-555-0100","aggregateRating":{"ratingValue":"4.9","reviewCount":"312"}}</script>
<style>.x{color:red}</style></head>
<body><nav><a href="/">Home</a><a href="/services/ac-repair/">AC Repair</a><a href="/about-us">About</a>
<a href="https://belkhvac.com/specials?utm=x">Specials</a><a href="/reviews#top">Reviews</a><a href="/privacy-policy">Privacy</a>
<a href="/blog/why-is-my-ac-leaking">Blog post</a><a href="https://facebook.com/belk">FB</a><a href="/financing">Financing</a>
<a href="/wp-content/uploads/a.pdf">PDF</a><a href="tel:5125550100">Call</a></nav>
<h1>AC Repair in Austin</h1><p>We&#39;ll fix it right or it&rsquo;s free.</p><script>var a=1</script>
<ul><li>$89 tune-up</li><li>Same-day service</li></ul></body></html>`

check('page text keeps words and drops code', htmlToText(html).split('\n').slice(-4), ['AC Repair in Austin', "We'll fix it right or it's free.", '$89 tune-up', 'Same-day service'])
{
  const m = pageMeta(html)
  check('title, description and structured business data', [m.title, m.description, m.structured.length, /reviewCount/.test(m.structured[0])], ['Belk Heating & Cooling | Austin AC Repair', 'Family owned since 2009.', 1, true])
}
{
  const links = sameSiteLinks(html, 'https://belkhvac.com/')
  check('same-site links only, no files, no home, no query strings',
    links.map((l) => l.url),
    ['https://belkhvac.com/services/ac-repair/', 'https://belkhvac.com/about-us', 'https://belkhvac.com/specials', 'https://belkhvac.com/reviews', 'https://belkhvac.com/privacy-policy', 'https://belkhvac.com/blog/why-is-my-ac-leaking', 'https://belkhvac.com/financing'])
  check('pages picked by what they are about, specials first, no privacy or blog posts',
    pickPages(links).map((p) => `${p.kind} ${new URL(p.url).pathname}`),
    ['specials /specials', 'reviews /reviews', 'about /about-us', 'financing /financing', 'services /services/ac-repair/'])
}
{
  const many = Array.from({ length: 20 }, (_, i) => ({ url: `https://x.com/services/thing-${i}`, text: `Service ${i}` }))
  check('never more than seven extra pages', pickPages(many).length, 7)
}

// --- sites drawn by JavaScript, through the reader service -----------------
{
  const body = `Title: Belk Heating & Cooling

URL Source: https://belkhvac.com/

Markdown Content:
**Belk Heating & Cooling** Need Warranty?  Now Offering 10 YR - Parts, Labor, and Refrigeration Warranty!

[View Now](https://belkhvac.com/warranty)

[![Image 2: Belk logo](https://belkhvac.com/images/logo.svg)](https://belkhvac.com/)

[![Image 4](https://belkhvac.com/images/metal-roof.png) Metal Roofing We install metal roofing systems.](https://belkhvac.com/metal-roofing)
[Reviews](https://belkhvac.com/reviews) [Facebook](https://facebook.com/belk)
---`
  const r = parseRendered(body)
  check('the reader answer splits into a title and the page', [r.title, r.markdown.startsWith('**Belk')], ['Belk Heating & Cooling', true])
  check('markdown to plain words, images gone, link words kept',
    markdownToText(r.markdown).split('\n'),
    ['Belk Heating & Cooling Need Warranty? Now Offering 10 YR - Parts, Labor, and Refrigeration Warranty!', 'View Now', 'Metal Roofing We install metal roofing systems.', 'Reviews Facebook'])
  check('same-site links out of the markdown, image-wrapped ones too',
    markdownLinks(r.markdown, 'https://belkhvac.com/').map((l) => `${new URL(l.url).pathname} ${l.text}`),
    ['/warranty View Now', '/metal-roofing Metal Roofing We install metal roofing systems.', '/reviews Reviews'])
}
check('a town called Plano is not a maintenance plan',
  pickPages([{ url: 'https://x.com/tankless-water-heater-installation-plano', text: 'Tankless' }, { url: 'https://x.com/maintenance-plans', text: 'Plans' }]).map((p) => p.kind),
  ['plans', 'services'])

// --- the brief --------------------------------------------------------------
{
  const b = websiteBlock({ website_profile: 'OFFERS AND SPECIALS\n- "$89 tune-up"', website_profile_at: '2026-09-29T14:00:00Z', website_profile_url: 'https://www.belkhvac.com/' })
  check('the brief section names the date and site and carries the sheet', [b.split('\n')[0], b.endsWith('- "$89 tune-up"')], ['=== FROM THEIR WEBSITE (read 2026-09-29 from belkhvac.com) ===', true])
  check('no sheet, no section', websiteBlock({ website_profile: '  ' }), '')
}
{
  const now = new Date('2026-09-29T12:00:00Z')
  check('reads by itself only when missing or stale, and not right after a failure',
    [
      shouldAutoRead({}, 'https://belkhvac.com/', now),
      shouldAutoRead({ website_profile: 'x', website_profile_at: '2026-09-01T00:00:00Z' }, 'https://belkhvac.com/', now),
      shouldAutoRead({ website_profile: 'x', website_profile_at: '2026-07-01T00:00:00Z' }, 'https://belkhvac.com/', now),
      shouldAutoRead({ website_profile_error: 'down', website_profile_at: '2026-09-27T00:00:00Z' }, 'https://belkhvac.com/', now),
      shouldAutoRead({ website_profile_error: 'down', website_profile_at: '2026-09-01T00:00:00Z' }, 'https://belkhvac.com/', now),
      shouldAutoRead({}, '', now),
    ],
    [true, false, true, false, true, false])
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
