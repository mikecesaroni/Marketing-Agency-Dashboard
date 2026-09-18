// Self-check for the launch pipeline. Run: node scripts/check-next-steps.mjs
//
// The rule: THE NEXT MOVE IS THE FIRST UNBLOCKED STEP THAT IS OURS; WHEN
// EVERYTHING OPEN IS THE CLIENT'S, THE NEXT MOVE IS THE CHASE; A STEP NEVER
// SHOWS AS NEXT WHILE THE STEP IT DEPENDS ON IS OPEN.

import { PHASES, currentPhase, nextLine, nextSteps, urgency } from '../src/lib/nextSteps.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const TODAY = '2026-09-18'
const base = (over = {}) => ({
  client: { id: 'c1', name: 'Acme HVAC', setup_fee: 1500, ghl_plan: false, ...over.client },
  intake: over.intake ?? null,
  link: over.link ?? null,
  ghl: over.ghl ?? null,
  ghlMissing: over.ghlMissing,
  deliverables: over.deliverables || [],
  payments: over.payments || [],
  callSteps: over.callSteps || [],
  counts: over.counts || {},
  today: TODAY,
})
const keys = (r) => r.steps.map((s) => s.key)
const dl = (key, status = 'done') => ({ template_key: key, status })

// --- a brand new client ---------------------------------------------------------
{
  const r = nextSteps(base())
  check('new client: setup fee, form and call lead the list', keys(r).slice(0, 3), ['setup-fee', 'onboarding-form', 'onboarding-call'])
  check('new client: no GHL steps when not on the plan', keys(r).some((k) => k.startsWith('ghl')), false)
  check('new client: next is the chase, since nothing open is ours', r.next.key, 'setup-fee')
  check('new client: the call is blocked by the form', r.steps.find((s) => s.key === 'onboarding-call').blocked, true)
  check('new client: creatives are blocked by Meta access', r.steps.find((s) => s.key === 'creatives').blockedBy, 'meta-access')
  check('new client: phase is Sign up', r.phase, 'Sign up')
  check('new client: nothing done', r.progress.done, 0)
  check('new client: no Run steps before launch', keys(r).includes('weekly-kpis'), false)
}

// --- form back, fee paid: the call is ours ----------------------------------------
{
  const r = nextSteps(
    base({
      link: { created_at: '2026-09-10', intake_submitted_at: '2026-09-12' },
      payments: [{ payment_type: 'setup', status: 'paid' }],
    })
  )
  check('form and fee done', r.steps.filter((s) => s.done).map((s) => s.key), ['setup-fee', 'onboarding-form'])
  check('next is the call, which is ours', [r.next.key, r.next.owner], ['onboarding-call', 'us'])
  check('the client-side waits are listed separately', r.theirs.map((s) => s.key), ['meta-access', 'photos', 'gbp-access'])
  check('phase still Sign up while the call is open', r.phase, 'Sign up')
}

// --- waiting on the client, with days ---------------------------------------------
{
  const r = nextSteps(base({ link: { created_at: '2026-09-01' } }))
  const form = r.steps.find((s) => s.key === 'onboarding-form')
  check('days waiting counted from the link', form.waitingDays, 17)
  check('urgency of a client-wait rises with days', urgency(r) > urgency(nextSteps(base({ link: { created_at: '2026-09-17' } }))), true)
}

// --- GHL on the plan ---------------------------------------------------------------
{
  const r = nextSteps(
    base({
      client: { ghl_plan: true, meta_ad_account_id: '1', meta_page_id: '2', drive_folder_id: 'f' },
      link: { created_at: '2026-09-01', intake_submitted_at: '2026-09-02', ghl_submitted_at: null },
      ghl: { ein: '1' },
      ghlMissing: ['business_address', 'authorised_contact'],
      payments: [{ payment_type: 'setup', status: 'paid' }],
      callSteps: [{ step_key: 'x' }],
      deliverables: [dl('ghl-a2p', 'todo'), dl('ghl-template'), dl('ghl-meta-form', 'todo'), dl('ghl-sms', 'todo')],
    })
  )
  check('GHL steps appear in order', keys(r).filter((k) => k.startsWith('ghl')), ['ghl-form', 'ghl-build', 'ghl-live'])
  check('GHL form open names the blanks', r.steps.find((s) => s.key === 'ghl-form').detail, '2 required fields still blank.')
  check('GHL build is blocked by the form', r.steps.find((s) => s.key === 'ghl-build').blocked, true)
  check('creatives are ours and unblocked (Meta and photos in)', r.next.key, 'creatives')
  check('publish is blocked until creatives exist', r.steps.find((s) => s.key === 'publish').blockedBy, 'creatives')
}
{
  const r = nextSteps(
    base({
      client: { ghl_plan: true, meta_ad_account_id: '1', meta_page_id: '2', drive_folder_id: 'f' },
      link: { created_at: '2026-09-01', intake_submitted_at: '2026-09-02', ghl_submitted_at: '2026-09-03' },
      payments: [{ payment_type: 'setup', status: 'paid' }],
      callSteps: [{ step_key: 'x' }],
      deliverables: [dl('ghl-a2p', 'todo'), dl('ghl-template'), dl('ghl-meta-form'), dl('ghl-sms')],
      counts: { savedAds: 4 },
    })
  )
  check('GHL build open lists what is left', r.steps.find((s) => s.key === 'ghl-build').detail, 'Still open: A2P registration.')
  check('publish is blocked by GHL live when on the plan', r.steps.find((s) => s.key === 'publish').blockedBy, 'ghl-live')
  check('next is the GHL build, the first unblocked step of ours', r.next.key, 'ghl-build')
  check('phase is Build', r.phase, 'Build')
}

// --- launched -----------------------------------------------------------------------
{
  const r = nextSteps(
    base({
      client: { meta_ad_account_id: '1', meta_page_id: '2', drive_folder_id: 'f', meta_ads_active: true, gbp_optimized: true },
      intake: { has_google_business: true, call_notes: 'done' },
      link: { created_at: '2026-08-01', intake_submitted_at: '2026-08-02' },
      payments: [{ payment_type: 'setup', status: 'paid' }],
      deliverables: [dl('meta-statics'), dl('meta-video'), dl('meta-live')],
      counts: { savedAds: 5, publishedAds: 6, kpisThisWeek: 0, reportThisMonth: 0 },
    })
  )
  check('launched: Run steps appear', keys(r).slice(-2), ['weekly-kpis', 'monthly-report'])
  check('launched: next is this week’s KPIs', r.next.key, 'weekly-kpis')
  check('launched: phase is Run', r.phase, 'Run')
  check('launched flag', r.launched, true)
  const quiet = nextSteps({ ...base(), client: { ...r.steps && {}, id: 'c', meta_ad_account_id: '1', meta_page_id: '2', drive_folder_id: 'f', meta_ads_active: true, gbp_optimized: true }, intake: { has_google_business: true, call_notes: 'x' }, link: { created_at: '2026-08-01', intake_submitted_at: '2026-08-02' }, payments: [{ payment_type: 'setup', status: 'paid' }], deliverables: [dl('meta-statics'), dl('meta-video')], counts: { savedAds: 5, publishedAds: 6, kpisThisWeek: 1, reportThisMonth: 1 } })
  check('launched and quiet: nothing next', quiet.next, null)
  check('launched and quiet reads as running', nextLine(quiet), 'Running. Nothing outstanding.')
  check('launched and quiet sorts last', urgency(quiet), 0)
}

// --- monthly report only asked from the 3rd ------------------------------------------
{
  const early = nextSteps({ ...base({ client: { meta_ads_active: true } }), today: '2026-09-02' })
  check('report step not applied on the 2nd', keys(early).includes('monthly-report'), false)
}

// --- Meta partly in ------------------------------------------------------------------
{
  const r = nextSteps(base({ client: { meta_ad_account_id: '1' } }))
  check('account in, page missing is said plainly', r.steps.find((s) => s.key === 'meta-access').detail, 'Ad account in. Facebook Page ID still missing (an ad is a Page post).')
}

// --- LSA only when it applies ------------------------------------------------------
{
  check('no LSA step by default', keys(nextSteps(base())).includes('lsa-access'), false)
  check('LSA step with a budget', keys(nextSteps(base({ client: { lsa_budget_per_day: 20 } }))).includes('lsa-access'), true)
  check('no GBP step when the intake says no profile', keys(nextSteps(base({ intake: { has_google_business: false } }))).includes('gbp-access'), false)
}

check('phases are in launch order', PHASES, ['Sign up', 'Access', 'Build', 'Launch', 'Run'])
check('currentPhase of nothing is Run', currentPhase([]), 'Run')
check('nextLine names the client wait', nextLine(nextSteps(base())), 'Setup fee paid (waiting on the client)')

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
