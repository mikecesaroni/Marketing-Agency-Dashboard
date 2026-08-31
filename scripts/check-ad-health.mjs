// Self-check for the "ads are not running" alert.
// Run: node scripts/check-ad-health.mjs
//
// Written after Summit Water Pros: their payment failed, Meta disabled the ad
// account, the ads stopped, and the CRM said nothing. They were still flagged
// meta_ads_active and the dashboard still counted them as live. The failure was
// an ABSENCE — spend that stopped arriving — and nothing was looking for one.
//
// The cases that matter most here are the false alarms. An alert that fires
// every morning for every client gets ignored, and then the next real outage is
// missed too.

import { adDeliveryAlerts, accountStatusOk, accountStatusLabel, QUIET_DAYS } from '../src/lib/adHealth.js'

const TODAY = '2026-08-31'
const client = (over) => ({
  id: over.name, meta_ads_active: true, archived: false, is_internal: false,
  meta_account_status: 1, meta_disable_reason: 0, ...over,
})
const spend = (last, over = {}) => ({ last_spend_date: last, spend_7d: 500, ...over })

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// --- the real case --------------------------------------------------------
// Summit as they actually stood: still marked active, account unsettled for
// non-payment, last spend two days ago.
// The real values, read off the live API: status 3 with disable_reason 0, and
// a $3.04 balance. That $3.04 is what stopped the ads.
{
  const summit = client({
    name: 'Summit Water Pros',
    meta_account_status: 3, meta_disable_reason: 0, meta_account_balance: 3.04,
  })
  const [alert] = adDeliveryAlerts([summit], { 'Summit Water Pros': spend('2026-08-29') }, TODAY)
  check('an unsettled account is flagged', alert?.kind, 'account')
  check('...as critical', alert?.severity, 'critical')
  check('...naming the state', alert?.headline, 'Ad account unsettled — unpaid balance')
  check('...leading with the amount owed', alert?.detail.startsWith('$3.04 outstanding'), true)
  check('...to the cent, since $3.04 really did stop a campaign',
    alert?.detail.includes('$3.04'), true)
}

// disable_reason IS set when Meta actively disables an account, and then it is
// worth saying.
{
  const banned = client({ name: 'banned', meta_account_status: 2, meta_disable_reason: 1 })
  const [alert] = adDeliveryAlerts([banned], { banned: spend('2026-08-20') }, TODAY)
  check('a disabled account names the reason', alert?.detail.includes('ads policy violation'), true)
  check('...and does not invent a balance', alert?.detail.includes('outstanding'), false)
}

// --- a healthy client is never flagged -----------------------------------
{
  const clients = [client({ name: 'fine' })]
  check('spent yesterday: no alert',
    adDeliveryAlerts(clients, { fine: spend('2026-08-30') }, TODAY).length, 0)
  check('spent today: no alert',
    adDeliveryAlerts(clients, { fine: spend('2026-08-31') }, TODAY).length, 0)
}

// The morning-after false alarm this is built to avoid. The sync runs each
// morning for the previous day, so "nothing today" is the normal state at 9am.
{
  const clients = [client({ name: 'yesterday' })]
  check('one quiet day is not an outage',
    adDeliveryAlerts(clients, { yesterday: spend('2026-08-30') }, TODAY).length, 0)
  check('QUIET_DAYS is 2 for exactly that reason', QUIET_DAYS, 2)
}

// --- gone quiet with a healthy account -----------------------------------
{
  const clients = [client({ name: 'quiet' })]
  const two = adDeliveryAlerts(clients, { quiet: spend('2026-08-29') }, TODAY)
  check('two quiet days is a warning', [two[0].kind, two[0].severity], ['quiet', 'warning'])
  check('...and counts the days', two[0].quietDays, 2)

  const four = adDeliveryAlerts(clients, { quiet: spend('2026-08-27') }, TODAY)
  check('four quiet days is critical', four[0].severity, 'critical')

  check('the detail points inside the account, not at Meta',
    two[0].detail.includes('paused campaigns'), true)
}

// --- who is deliberately left out ----------------------------------------
{
  // Not launched yet. Already on the dashboard as "Meta not live yet"; alerting
  // here as well would bury a real outage under clients who were never on.
  check('a client not marked meta_ads_active is ignored',
    adDeliveryAlerts([client({ name: 'notlive', meta_ads_active: false })], {}, TODAY).length, 0)

  // Live, but has never spent. Could have launched an hour ago.
  check('a live client who has never spent is not an outage',
    adDeliveryAlerts([client({ name: 'brandnew' })], {}, TODAY).length, 0)

  check('archived clients are ignored',
    adDeliveryAlerts([client({ name: 'gone', archived: true, meta_account_status: 2 })],
      { gone: spend('2026-01-01') }, TODAY).length, 0)

  check('so are the businesses we run ourselves',
    adDeliveryAlerts([client({ name: 'ours', is_internal: true, meta_account_status: 2 })],
      { ours: spend('2026-01-01') }, TODAY).length, 0)
}

// --- an unknown status must not cry wolf ---------------------------------
// Meta adds account_status values. Treating an unrecognised one as broken
// would fire for every client at once, on a day nothing was actually wrong.
{
  check('an unknown status is treated as fine', accountStatusOk(4242), true)
  check('a null status is treated as fine', accountStatusOk(null), true)
  check('a never-synced client is not flagged',
    adDeliveryAlerts([client({ name: 'unsynced', meta_account_status: null })],
      { unsynced: spend('2026-08-30') }, TODAY).length, 0)
  check('but an unknown status still reads sensibly if shown',
    accountStatusLabel(4242), 'status 4242')
}

// --- the account status wins over the quiet count ------------------------
// Both are true when an account is disabled. Reporting it twice for one client
// would double the apparent number of outages.
{
  const clients = [client({ name: 'both', meta_account_status: 2, meta_disable_reason: 1 })]
  const alerts = adDeliveryAlerts(clients, { both: spend('2026-08-20') }, TODAY)
  check('one alert per client, not two', alerts.length, 1)
  check('and it is the one that explains why', alerts[0].kind, 'account')
  check('...while still reporting how long', alerts[0].quietDays, 11)
}

// --- ordering ------------------------------------------------------------
{
  const clients = [
    client({ name: 'short' }),
    client({ name: 'long' }),
    client({ name: 'middle' }),
  ]
  const delivery = {
    short: spend('2026-08-29'), long: spend('2026-08-10'), middle: spend('2026-08-25'),
  }
  check('longest outage first',
    adDeliveryAlerts(clients, delivery, TODAY).map((a) => a.client.name),
    ['long', 'middle', 'short'])
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
