// Who is ready for ads.
//
// This decides what gets built next, so the two ways it could be wrong are
// worth pinning down, and they are not symmetrical:
//
//   A FALSE READY COSTS MONEY. Ads that run before the SMS follow-up exists
//   generate leads nothing answers. So "built" must never be inferred from an
//   absence of evidence -- a client with no GHL deliverables seeded and no
//   flag set is NOT ready.
//
//   A FALSE BLOCKED COSTS A DAY. It reads as "waiting on the client" when the
//   work is actually mine, so the two queues must never overlap or swap.
//
// Run with: node scripts/check-ads-ready.mjs

import { GHL_BACKEND_KEYS, adsReady, backendState } from '../src/lib/adsReady.js'

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`PASS  ${name}`)
  else {
    failures++
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const client = (over = {}) => ({
  id: 'c1',
  name: 'Acme HVAC',
  archived: false,
  ghl_plan: true,
  ghl_active: false,
  meta_ads_active: false,
  meta_ad_account_id: '123',
  meta_page_id: '456',
  website_url: 'https://acme.test',
  privacy_policy_url: 'https://acme.test/privacy',
  ...over,
})

// Every backend item, at whatever status.
const backend = (clientId, status = 'done', over = {}) =>
  GHL_BACKEND_KEYS.map((key) => ({
    id: `${clientId}-${key}`,
    client_id: clientId,
    template_key: key,
    status,
    ...over,
  }))

const run = (clients, deliverables = []) => adsReady({ clients, deliverables })

// --- the whole point --------------------------------------------------------
const done = run([client()], backend('c1'))
check('backend built, Meta connected, ads off — ready', done.ready.length === 1 && done.blocked.length === 0)
check('and it says there is nothing in the way', done.ready[0].note === 'GHL built · nothing in the way', done.ready[0].note)

// --- a false ready is the expensive mistake ---------------------------------
check(
  'no deliverables and no flag is NOT ready',
  run([client()], []).ready.length === 0 && run([client()], []).blocked.length === 0
)
check(
  'one item still open is not ready',
  run([client()], [...backend('c1'), { id: 'x', client_id: 'c1', template_key: 'ghl-sms', status: 'todo' }])
    .ready.length === 1
    ? false
    : true
)
const partial = run([client()], [
  ...backend('c1').slice(0, 3),
  { id: 'open', client_id: 'c1', template_key: 'ghl-sms', status: 'todo' },
])
check('three of four done is not ready', partial.ready.length === 0 && partial.blocked.length === 0)
check(
  'in progress is not done',
  run([client()], backend('c1', 'in progress')).ready.length === 0
)
check(
  'another client\'s finished backend does not count as ours',
  run([client()], backend('someone-else')).ready.length === 0
)

// --- the flag is accepted, and labelled honestly ----------------------------
const flagged = run([client({ ghl_active: true })], [
  ...backend('c1').slice(0, 2),
  { id: 'o1', client_id: 'c1', template_key: 'ghl-sms', status: 'todo' },
  { id: 'o2', client_id: 'c1', template_key: 'ghl-meta-form', status: 'todo' },
])
check('ghl_active alone is enough to queue them', flagged.ready.length === 1)
check(
  'but the row says the items are still open rather than claiming it is built',
  flagged.ready[0].note === 'GHL marked live · 2 of 4 items still open',
  flagged.ready[0].note
)
check(
  'the flag with nothing seeded still queues them',
  run([client({ ghl_active: true })], []).ready.length === 1
)

// --- blocked on the client --------------------------------------------------
const noAccount = run([client({ meta_ad_account_id: null })], backend('c1'))
check('backend done but no ad account is blocked, not ready', noAccount.blocked.length === 1 && noAccount.ready.length === 0)
check('and it names what is missing', noAccount.blocked[0].note === 'waiting on their ad account', noAccount.blocked[0].note)

const noPage = run([client({ meta_page_id: null })], backend('c1'))
check('no Page is blocked too — an ad is a Page post', noPage.blocked.length === 1)
check('and it says so', noPage.blocked[0].note === 'waiting on their Facebook Page', noPage.blocked[0].note)

const neither = run([client({ meta_ad_account_id: null, meta_page_id: null })], backend('c1'))
check(
  'missing both is one row naming both',
  neither.blocked.length === 1 && neither.blocked[0].note === 'waiting on their ad account and Facebook Page',
  neither.blocked[0]?.note
)
check('the two queues never overlap', neither.ready.length === 0)

// --- soft prerequisites are named, not enforced -----------------------------
const noUrls = run([client({ website_url: null, privacy_policy_url: null })], backend('c1'))
check('a missing URL does not hold them out of the queue', noUrls.ready.length === 1)
check(
  'it is named instead, because which one is needed depends on the campaign',
  noUrls.ready[0].note === 'GHL built · needs landing page URL and privacy policy URL',
  noUrls.ready[0].note
)
check(
  'one missing URL reads as one',
  run([client({ privacy_policy_url: null })], backend('c1')).ready[0].note ===
    'GHL built · needs privacy policy URL'
)

// --- who is excluded outright ----------------------------------------------
check('ads already live: not a queue of work to start', run([client({ meta_ads_active: true })], backend('c1')).ready.length === 0)
check('not on the GHL plan: their backend is not ours', run([client({ ghl_plan: false })], backend('c1')).ready.length === 0)
check('archived: gone from everything', run([client({ archived: true })], backend('c1')).ready.length === 0)
check(
  'an internal business is included — work is work',
  run([client({ is_internal: true })], backend('c1')).ready.length === 1
)

// --- the shape the dashboard needs -----------------------------------------
const many = run(
  [
    client({ id: 'z', name: 'Zeta Plumbing' }),
    client({ id: 'a', name: 'Alpha Air' }),
    client({ id: 'm', name: 'Mid Mechanical', meta_page_id: null }),
  ],
  [...backend('z'), ...backend('a'), ...backend('m')]
)
check('ready is sorted by name', many.ready.map((r) => r.name).join(',') === 'Alpha Air,Zeta Plumbing')
check('blocked is separate and also sorted', many.blocked.map((r) => r.name).join(',') === 'Mid Mechanical')
check('each row carries the id the link needs', many.ready.every((r) => r.id))

// --- the state helper on its own -------------------------------------------
const state = backendState(client(), backend('c1'))
check('the counts are reported for the row to use', state.doneCount === 4 && state.total === 4 && state.allDone === true)
const half = backendState(client(), [
  ...backend('c1').slice(0, 2),
  { id: 'o', client_id: 'c1', template_key: 'ghl-sms', status: 'todo' },
])
check('and which items are open, by name', half.openLabels.join(',') === 'SMS follow-up', half.openLabels.join(','))
check('the four keys are the four', GHL_BACKEND_KEYS.join(',') === 'ghl-a2p,ghl-template,ghl-meta-form,ghl-sms')

// --- empties ----------------------------------------------------------------
check('no clients is two empty queues', adsReady().ready.length === 0 && adsReady().blocked.length === 0)
check('no arguments does not throw', JSON.stringify(adsReady()) === '{"ready":[],"blocked":[]}')

if (failures > 0) {
  console.error(`\nads-ready checks FAILED (${failures})`)
  process.exit(1)
}
console.log('\nAll ads-ready checks passed')
