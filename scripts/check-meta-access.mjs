// The access verdicts.
//
// The fixtures below are real shapes taken off the live API, including the
// under-permissioned Page that prompted this whole feature: one client had
// ["PROFILE_PLUS_ANALYZE","PROFILE_PLUS_ADVERTISE"] while another had ten
// tasks. Both looked shared. Only one could be published from.
//
// Run with: node scripts/check-meta-access.mjs

import {
  accessReport,
  assetVerdict,
  chaseLine,
  describeTask,
  normaliseTask,
  sameId,
  taskCheck,
} from '../src/lib/metaAccess.js'

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`PASS  ${name}`)
  else {
    failures++
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// --- id and task normalising ---------------------------------------------
check('act_ prefix is ignored when comparing', sameId('act_123', '123'))
check('different accounts do not match', !sameId('act_123', '124'))
check('an empty id never matches', !sameId('', '') && !sameId(null, null))

check('the new Pages task naming folds onto the old', normaliseTask('PROFILE_PLUS_MANAGE') === 'MANAGE')
check('the old naming is left alone', normaliseTask('CREATE_CONTENT') === 'CREATE_CONTENT')
check('tasks are described in plain words', describeTask('PROFILE_PLUS_ADVERTISE') === 'run ads')
check('an unknown task still reads as something', describeTask('SOME_NEW_TASK') === 'some new task')

// --- fixtures off the live API -------------------------------------------
const PAGES = [
  {
    id: '113420158466539',
    name: 'Horizon HVAC',
    permitted_tasks: [
      'PROFILE_PLUS_CREATIVE_MANAGEMENT',
      'PROFILE_PLUS_MODERATE',
      'PROFILE_PLUS_MESSAGING',
      'PROFILE_PLUS_ANALYZE',
      'PROFILE_PLUS_ADVERTISE',
      'PROFILE_PLUS_CREATE_CONTENT',
      'PROFILE_PLUS_FACEBOOK_ACCESS',
      'PROFILE_PLUS_MANAGE',
    ],
  },
  // The one that started this. Shared, and cannot be published from.
  {
    id: '756448844499117',
    name: 'Plumb Quick Company',
    permitted_tasks: ['PROFILE_PLUS_ANALYZE', 'PROFILE_PLUS_ADVERTISE'],
  },
  { id: '999000111', name: 'Nobody Owns This Page', permitted_tasks: ['PROFILE_PLUS_MANAGE'] },
]

const AD_ACCOUNTS = [
  {
    id: 'act_579874845095389',
    name: 'Horizon HVAC',
    permitted_tasks: ['DRAFT', 'ANALYZE', 'ADVERTISE', 'MANAGE'],
  },
  // Reporting only: the exact half-grant, on the asset that matters most.
  { id: 'act_111222333', name: 'Reporting Only Co', permitted_tasks: ['ANALYZE'] },
]

const CLIENTS = [
  { id: 'c1', name: 'Horizon HVAC', meta_page_id: '113420158466539', meta_ad_account_id: '579874845095389' },
  { id: 'c2', name: 'Plumb Quick', meta_page_id: '756448844499117', meta_ad_account_id: null },
  { id: 'c3', name: 'Reporting Only Co', meta_page_id: null, meta_ad_account_id: 'act_111222333' },
  { id: 'c4', name: 'Revoked Ltd', meta_page_id: '555555555', meta_ad_account_id: '888888888' },
  { id: 'c5', name: 'Brand New', meta_page_id: null, meta_ad_account_id: null },
]

// --- one asset at a time -------------------------------------------------
const full = assetVerdict({
  crmId: '113420158466539',
  granted: PAGES,
  required: ['ADVERTISE', 'CREATE_CONTENT'],
  fullTask: 'MANAGE',
})
check('full control reads ok and says so', full.state === 'ok' && full.full === true)

const half = assetVerdict({
  crmId: '756448844499117',
  granted: PAGES,
  required: ['ADVERTISE', 'CREATE_CONTENT'],
  fullTask: 'MANAGE',
})
check('the under-permissioned Page is caught', half.state === 'partial', half.state)
check(
  'and it names exactly what is short',
  half.lacking.join(',') === 'CREATE_CONTENT',
  half.lacking.join(',')
)
check('a partial grant is not reported as full', half.full === false)

check(
  'an asset the CRM names but Meta does not list reads missing',
  assetVerdict({ crmId: '404404404', granted: PAGES, required: [], fullTask: 'MANAGE' }).state ===
    'missing'
)
check(
  'no id at all is not-connected rather than missing',
  assetVerdict({ crmId: null, granted: PAGES, required: [], fullTask: 'MANAGE' }).state ===
    'not_connected'
)
check(
  'an ad account matches whether or not the CRM stored the act_ prefix',
  assetVerdict({
    crmId: '579874845095389',
    granted: AD_ACCOUNTS,
    required: ['ADVERTISE'],
    fullTask: 'MANAGE',
  }).state === 'ok'
)

// --- the whole report ----------------------------------------------------
const report = accessReport({ clients: CLIENTS, pages: PAGES, adAccounts: AD_ACCOUNTS })

check('every client appears', report.clients.length === 5)
check(
  'clients needing attention come first',
  report.clients.slice(0, 3).every((r) => r.needsAttention) &&
    report.clients.slice(3).every((r) => !r.needsAttention),
  report.clients.map((r) => `${r.clientName}:${r.needsAttention}`).join(' ')
)

const horizon = report.clients.find((r) => r.clientName === 'Horizon HVAC')
check('a fully granted client needs no attention', horizon.needsAttention === false)

const plumb = report.clients.find((r) => r.clientName === 'Plumb Quick')
check('the half-granted Page raises attention', plumb.needsAttention === true)
check('its ad account is merely not connected', plumb.adAccount.state === 'not_connected')

const reporting = report.clients.find((r) => r.clientName === 'Reporting Only Co')
check('an ad account granted at Analyze only is partial', reporting.adAccount.state === 'partial')

const revoked = report.clients.find((r) => r.clientName === 'Revoked Ltd')
check(
  'access that was never granted or has been revoked reads missing on both',
  revoked.page.state === 'missing' && revoked.adAccount.state === 'missing'
)

const brandNew = report.clients.find((r) => r.clientName === 'Brand New')
check('a client with nothing connected is not flagged as a problem', brandNew.needsAttention === false)

check('summary counts attention', report.summary.attention === 3, String(report.summary.attention))
check('summary counts partial separately', report.summary.partial === 2, String(report.summary.partial))
check('summary counts missing separately', report.summary.missing === 1, String(report.summary.missing))

// --- granted but not wired up -------------------------------------------
check(
  'a Page nobody claims is surfaced as work to do',
  report.unclaimedPages.length === 1 && report.unclaimedPages[0].name === 'Nobody Owns This Page',
  report.unclaimedPages.map((p) => p.name).join(',')
)
check(
  'a claimed ad account is not called unclaimed just because of the act_ prefix',
  !report.unclaimedAdAccounts.some((a) => a.id === 'act_579874845095389'),
  report.unclaimedAdAccounts.map((a) => a.id).join(',')
)

// An unclaimed asset carries its own permission verdict, so connecting it
// cannot hand you a surprise. The real account has exactly this case: a Page
// granted at reporting level, waiting to be wired to a client.
const shortUnclaimed = accessReport({
  clients: [],
  pages: [PAGES[1]],
  adAccounts: [],
}).unclaimedPages[0]
check(
  'an unclaimed asset reports whether its permission level is enough',
  shortUnclaimed.level.state === 'partial' && shortUnclaimed.level.lacking.includes('CREATE_CONTENT'),
  JSON.stringify(shortUnclaimed.level)
)
check(
  'a fully granted unclaimed asset reads ok',
  accessReport({ clients: [], pages: [PAGES[0]], adAccounts: [] }).unclaimedPages[0].level
    .state === 'ok'
)

// --- the sentence you forward -------------------------------------------
check(
  'the chase line names the specific gap',
  chaseLine(plumb) === 'Plumb Quick: needs to raise the Page permissions so we can post as the Page.',
  chaseLine(plumb)
)
check(
  'a missing ad account is asked for plainly',
  chaseLine(revoked) === 'Revoked Ltd: needs to share the ad account and share the Facebook Page.',
  chaseLine(revoked)
)
check('a client with nothing wrong gets no line', chaseLine(horizon) === '')
check(
  'a partial ad account is described by what it cannot do',
  chaseLine(reporting) === 'Reporting Only Co: needs to raise the ad account permissions so we can run ads.',
  chaseLine(reporting)
)

// --- empties -------------------------------------------------------------
const empty = accessReport({ clients: [], pages: [], adAccounts: [] })
check('an empty account does not throw', empty.clients.length === 0 && empty.summary.attention === 0)
check(
  'no granted lists at all means everything reads missing, not ok',
  accessReport({ clients: CLIENTS, pages: [], adAccounts: [] }).summary.missing === 4
)

if (failures > 0) {
  console.error(`\nmeta-access checks FAILED (${failures})`)
  process.exit(1)
}
console.log('\nAll meta-access checks passed')
