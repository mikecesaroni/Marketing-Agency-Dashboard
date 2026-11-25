// Self-check for pairing linked Google Ads accounts with CRM clients by name.
// Run: node scripts/check-google-ads-match.mjs
//
// The nightly sync saves a customer id on a client row only when the match
// is sure, because a wrong id syncs one client's spend onto another's report.
// These pin down what "sure" means, with the real client names.

import { readFileSync } from 'node:fs'
import { extraIdsOf, matchAccounts, normalizeName } from '../supabase/functions/google-daily-sync/index.ts'
import { allCustomerIds, extraCustomerIds, extraIdProblem } from '../src/lib/googleAdsId.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const acct = (id, name, over = {}) => ({ id, name, manager: false, status: 'ENABLED', currency: 'USD', via: 'manager', ...over })
const client = (id, name, over = {}) => ({ id, name, google_ads_customer_id: null, ...over })

check('normalize drops punctuation and legal suffixes',
  ['Dynamic Flow, Inc.', 'Tito’s Appliances', 'Belk Heating & Cooling', 'MCL Construction LLC'].map(normalizeName),
  ['dynamic flow', 'titos appliances', 'belk heating and cooling', 'mcl construction'])

// --- sure matches ----------------------------------------------------------
{
  const { matches, unclaimed } = matchAccounts(
    [client('c1', 'Belk Heating and Cooling'), client('c2', 'Dynamic Flow, Inc.')],
    [acct('1111111111', 'Belk Heating and Cooling'), acct('2222222222', 'Dynamic Flow Inc'), acct('3333333333', 'Somebody Else')]
  )
  check('equal names match, punctuation aside',
    matches.map((m) => [m.client, m.customer_id, m.how]),
    [['Belk Heating and Cooling', '1111111111', 'exact'], ['Dynamic Flow, Inc.', '2222222222', 'exact']])
  check('what nobody matched is left to pick from', unclaimed.map((a) => a.id), ['3333333333'])
}

{
  const { matches } = matchAccounts(
    [client('c1', 'Perfect Breeze')],
    [acct('1111111111', 'Perfect Breeze Heating and Air Conditioning')]
  )
  check('a name inside a longer account name matches', matches.map((m) => m.how), ['contains'])
}

// --- not sure: never saved, always offered ---------------------------------
{
  const { matches, candidates } = matchAccounts(
    [client('c1', 'Luccia Brother Mechanicle')],
    [acct('1111111111', 'Luccia Brothers Mechanical'), acct('2222222222', 'Reliable Heating')]
  )
  check('a near miss is not saved', matches.length, 0)
  // "Mechanicle" is a typo on the client row, so only one of three words
  // lands; the score says how close it is, the order is what matters.
  check('but is offered first, scored by the words that matter',
    candidates.c1.map((c) => [c.customer_id, c.score]), [['1111111111', 0.33]])
}

{
  // Two accounts both called what the client is called: not unique, not saved.
  const { matches, candidates } = matchAccounts(
    [client('c1', 'Pillar HVAC')],
    [acct('1111111111', 'Pillar HVAC'), acct('2222222222', 'Pillar HVAC')]
  )
  check('two accounts with the same name: ask a person', [matches.length, candidates.c1.length], [0, 2])
}

{
  // Two clients sure of the same account: neither gets it.
  const { matches } = matchAccounts(
    [client('c1', 'Comfort Experts'), client('c2', 'Comfort Experts NY')],
    [acct('1111111111', 'Comfort Experts')]
  )
  check('two clients claiming one account: nobody gets it by default', matches.length, 0)
}

{
  const short = matchAccounts([client('c1', 'MCL')], [acct('1111111111', 'MCL Construction')])
  check('a very short name is not "contained" on its own', short.matches.length, 0)
  check('...but is still offered', short.candidates.c1?.[0]?.customer_id, '1111111111')
}

// --- what is skipped -------------------------------------------------------
{
  const { matches, unclaimed } = matchAccounts(
    [client('c1', 'Belk Heating and Cooling', { google_ads_customer_id: '111-111-1111' }), client('c2', 'Belk Heating')],
    [acct('1111111111', 'Belk Heating and Cooling'), acct('9999999999', 'Sub Manager', { manager: true })]
  )
  check('an account a client already has is not offered to another', [matches.length, unclaimed.length], [0, 0])
}

{
  const { matches } = matchAccounts(
    [client('c1', 'Belk Heating and Cooling', { google_ads_customer_id: '1111111111' })],
    [acct('1111111111', 'Belk Heating and Cooling')]
  )
  check('a client with an id already is left alone', matches.length, 0)
}

check('an empty manager is an empty answer, not an error',
  matchAccounts([client('c1', 'Belk')], []), { matches: [], candidates: {}, unclaimed: [] })

// --- more than one account on a client --------------------------------------
// The rule: EVERY ACCOUNT A CLIENT HAS IS READ, AND ONE ACCOUNT BELONGS TO ONE
// CLIENT. An extra account the sync forgot is spend nobody sees; the same
// account on two clients is spend counted twice.
const two = { id: 'c1', name: 'Belk Heating and Cooling', google_ads_customer_id: '111-111-1111', google_ads_extra_customer_ids: ['222-222-2222', '2222222222', '111-111-1111', '12345', null, ' 333 333 3333 '] }
check('extra accounts are ten digits, once each, never the main one again', extraIdsOf(two), ['2222222222', '3333333333'])
check('the app reads the list the same way as the sync', extraCustomerIds(two), extraIdsOf(two))
check('main account first, then the others', allCustomerIds(two), ['1111111111', '2222222222', '3333333333'])
check('a client with none has none', [extraIdsOf({ google_ads_customer_id: '1111111111' }), extraCustomerIds({}), extraIdsOf(null), allCustomerIds({})], [[], [], [], []])
{
  const { matches, unclaimed } = matchAccounts(
    [two, client('c2', 'Belk Heating')],
    [acct('1111111111', 'Belk Heating and Cooling'), acct('2222222222', 'Belk Heating'), acct('4444444444', 'Somebody Else')]
  )
  check('an account that is one client\'s extra is not given or offered to another', [matches.length, unclaimed.map((a) => a.id)], [0, ['4444444444']])
}

const book = [
  two,
  { id: 'c2', name: 'Dynamic Flow, Inc.', google_ads_customer_id: '5555555555', google_ads_extra_customer_ids: ['6666666666'], lsa_customer_id: '7777777777' },
  { id: 'c3', name: 'No Google Yet', google_ads_customer_id: null },
]
check('a new account can be added', extraIdProblem('888-888-8888', two, book), '')
check('not ten digits is said', extraIdProblem('12345', two, book), 'A Google Ads customer ID is ten digits, like 123-456-7890.')
check('the main account again is said', extraIdProblem('1111111111', two, book), 'That is this client’s main account already.')
check('one already on the list is said', extraIdProblem('222-222-2222', two, book), 'That account is already on this client.')
check('another client\'s main account is refused, by name', extraIdProblem('5555555555', two, book), 'That account is already on Dynamic Flow, Inc.. One account on two clients counts its spend twice.')
check('another client\'s extra account is refused', /Dynamic Flow/.test(extraIdProblem('6666666666', two, book)), true)
check('another client\'s Local Services account is refused', /Dynamic Flow/.test(extraIdProblem('7777777777', two, book)), true)
check('a client with no main account adds that first', extraIdProblem('8888888888', book[2], book), 'Save this client’s main Google Ads account first.')

// The sync itself runs in Deno against Google, so these read its source for
// the three things that would silently lose or double an extra account.
const sync = readFileSync(new URL('../supabase/functions/google-daily-sync/index.ts', import.meta.url), 'utf8')
check('the sync reads each extra account the way it reads the main one', /for \(const account of extraIdsOf\(client\)\) \{\s*try \{\s*const \[k, t, c, i\] = await readAccount\(account\)/.test(sync), true)
check('an extra account that fails does not fail the client', /extraStatus\[account\] = \{ ok: false, error:/.test(sync), true)
check('an extra account\'s rows are the client\'s own and are not cleaned away', /const own = \[\.\.\.new Set\(\[customerId, \.\.\.extraIdsOf\(client\), lsaAccount\]/.test(sync), true)
check('every account\'s rows carry that account\'s own id', (sync.match(/customer_id: s\.account,/g) || []).length, 2)
check('the weekly totals add every account up', /let allCampaigns = sources\.flatMap\(\(s\) => s\.campaigns\)/.test(sync), true)
check('how each extra account read is saved apart from the main account\'s error', /google_ads_extra_status: extras\.length \? extraStatus : null/.test(sync), true)

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
