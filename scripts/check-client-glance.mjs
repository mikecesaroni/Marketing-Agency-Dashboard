// Self-check for the client page's contact strip and at-a-glance numbers.
// Run: node scripts/check-client-glance.mjs

import { clientContact, clientGlance, daysBetween, taskCounts, telHref, websiteHref, websiteLabel } from '../src/lib/clientGlance.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// --- contact ------------------------------------------------------------------
check('the intake wins when it has everything',
  clientContact({
    client: { website_url: 'old.com', market: 'Austin' },
    intake: { owner_name: 'Noah', contact_phone: '555-0100', contact_email: 'noah@belk.com', website: 'belk.com', service_area: 'Round Rock, TX' },
    ghl: { main_phone: '555-9999', support_email: 'support@belk.com', website_url: 'ghl.com' },
  }),
  { owner: 'Noah', phone: '555-0100', email: 'noah@belk.com', website: 'belk.com', area: 'Round Rock, TX' })
check('the GHL form fills what the intake left blank (Active Air has no intake phone)',
  clientContact({ intake: { contact_phone: '  ', contact_email: 'a@b.com' }, ghl: { main_phone: '(512) 555-0142', support_email: 'x@y.com', authorized_rep_name: 'Dale', business_city: 'Austin' } }),
  { owner: 'Dale', phone: '(512) 555-0142', email: 'a@b.com', website: '', area: 'Austin' })
check('the client row is the last resort for website and area',
  clientContact({ client: { website_url: 'comfortexperts.com', market: 'Westchester' } }),
  { owner: '', phone: '', email: '', website: 'comfortexperts.com', area: 'Westchester' })
check('nothing at all is blanks, not a crash', clientContact(), { owner: '', phone: '', email: '', website: '', area: '' })

check('tel links keep a leading + and drop punctuation',
  [telHref('(512) 555-0142'), telHref('+1 512 555 0142'), telHref('call me'), telHref('')],
  ['tel:5125550142', 'tel:+15125550142', '', ''])
check('websites get https when typed bare, and a clean label',
  [websiteHref('belk.com'), websiteHref('http://belk.com'), websiteHref(''), websiteLabel('https://www.belk.com/')],
  ['https://belk.com', 'http://belk.com', '', 'belk.com'])

// --- glance --------------------------------------------------------------------
check('days between dates', [daysBetween('2026-09-18', '2026-09-28'), daysBetween('2026-09-28T15:00:00Z', '2026-09-28')], [10, 0])
{
  const g = clientGlance({
    metaRows: [{ spend: 100, leads: 3 }, { spend: 50, leads: 1 }],
    googleRows: [{ cost: 50, conversions: 1.5 }],
    newestAdDate: '2026-09-18',
    publishedAt: '2026-09-21T14:00:00Z',
    today: '2026-09-28',
  })
  check('spend and leads add both channels, cost per lead from the sum', [g.spend, g.leads, g.cpl], [200, 5.5, 36.36])
  check('each channel is kept alongside', [g.meta, g.google], [{ spend: 150, leads: 4 }, { spend: 50, leads: 1.5 }])
  check('the last new ad is the later of the two dates', [g.lastAd, g.daysSinceAd], ['2026-09-21', 7])
}
check('a client with nothing reads zeros and no last ad',
  clientGlance({ today: '2026-09-28' }), { spend: 0, leads: 0, cpl: 0, meta: { spend: 0, leads: 0 }, google: { spend: 0, leads: 0 }, lastAd: '', daysSinceAd: null })

check('open and overdue count top-level open tasks only',
  taskCounts([
    { status: 'todo', due_date: '2026-09-20' },
    { status: 'in_progress', due_date: '2026-10-01' },
    { status: 'done', due_date: '2026-09-01' },
    { status: 'todo', due_date: '2026-09-01', parent_id: 'x' },
    { status: 'todo' },
  ], '2026-09-28'),
  { open: 3, overdue: 1 })

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
