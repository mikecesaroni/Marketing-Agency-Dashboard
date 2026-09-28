// Self-check for pairing linked Google Ads accounts with CRM clients by name.
// Run: node scripts/check-google-ads-match.mjs
//
// The nightly sync saves a customer id on a client row only when the match
// is sure, because a wrong id syncs one client's spend onto another's report.
// These pin down what "sure" means, with the real client names.

import { matchAccounts, normalizeName } from '../supabase/functions/google-daily-sync/index.ts'

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

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
