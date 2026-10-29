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
  overrides: over.overrides || [],
  today: TODAY,
})
const keys = (r) => r.steps.map((s) => s.key)
const dl = (key, status = 'done') => ({ template_key: key, status })

// --- a brand new client ---------------------------------------------------------
{
  const r = nextSteps(base())
  check('new client: setup fee, form and call lead the list', keys(r).slice(0, 3), ['setup-fee', 'onboarding-form', 'onboarding-call'])
  check('new client: no GHL steps when not on the plan', keys(r).some((k) => k.startsWith('ghl')), false)
  check('new client: next is ours, send the form, since nothing has gone out yet', [r.next.key, r.next.owner, r.next.title], ['onboarding-form', 'us', 'Send the onboarding form'])
  check('new client: nothing is theirs to be late on before the message goes out', r.theirs.length > 0 && r.theirs.every((s) => s.waitingDays === null), true)
  check('new client: the next line does not call it a wait', nextLine(r), 'Send the onboarding form')
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
  check('the client-side waits are listed separately', r.theirs.map((s) => s.key), ['meta-access', 'photos'])
  check('phase still Sign up while the call is open', r.phase, 'Sign up')
}

// --- waiting on the client, with days ---------------------------------------------
{
  const r = nextSteps(base({ link: { created_at: '2026-09-01' } }))
  const form = r.steps.find((s) => s.key === 'onboarding-form')
  check('days waiting counted from the link', form.waitingDays, 17)
  check('with the link out, the form is theirs', [form.owner, form.title], ['client', 'Onboarding form filled in'])
  check('the other asks in the message count from the link too', r.steps.find((s) => s.key === 'photos').waitingDays, 17)
  check('a client added long ago but never written to has no wait', nextSteps(base({ client: { date_added: '2026-08-01', contract_start_date: '2026-08-01' } })).theirs.every((s) => s.waitingDays === null), true)
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
  check('launched: the Run step appears', keys(r).slice(-1), ['weekly-kpis'])
  check('launched: no monthly report chore (it is automated separately)', keys(r).includes('monthly-report'), false)
  check('launched: next is this week’s KPIs', r.next.key, 'weekly-kpis')
  check('launched: phase is Run', r.phase, 'Run')
  check('launched flag', r.launched, true)
  const quiet = nextSteps({ ...base(), client: { ...r.steps && {}, id: 'c', meta_ad_account_id: '1', meta_page_id: '2', drive_folder_id: 'f', meta_ads_active: true, gbp_optimized: true }, intake: { has_google_business: true, call_notes: 'x' }, link: { created_at: '2026-08-01', intake_submitted_at: '2026-08-02' }, payments: [{ payment_type: 'setup', status: 'paid' }], deliverables: [dl('meta-statics'), dl('meta-video')], counts: { savedAds: 5, publishedAds: 6, kpisThisWeek: 1, reportThisMonth: 1 } })
  check('launched and quiet: nothing next', quiet.next, null)
  check('launched and quiet reads as running', nextLine(quiet), 'Running. Nothing outstanding.')
  check('launched and quiet sorts last', urgency(quiet), 0)
}

// --- Meta partly in ------------------------------------------------------------------
{
  const r = nextSteps(base({ client: { meta_ad_account_id: '1' } }))
  check('account in, page missing is said plainly', r.steps.find((s) => s.key === 'meta-access').detail, 'Ad account in. Facebook Page ID still missing (an ad is a Page post).')
}

// --- LSA only when it applies ------------------------------------------------------
{
  check('no Google Ads step by default', keys(nextSteps(base())).includes('google-ads-access'), false)
  check('Google Ads step when LSA is planned', keys(nextSteps(base({ client: { lsa_budget_per_day: 20 } }))).includes('google-ads-access'), true)
  {
    const step = (client) => nextSteps(base({ client })).steps.find((s) => s.key === 'google-ads-access')
    check('Google Ads access is done once the ID is in and Google let us in',
      [step({ lsa_budget_per_day: 20 }).done, step({ google_ads_customer_id: '5192851350' }).done, step({ google_ads_customer_id: '5192851350', google_ads_sync_error: 'The caller does not have permission' }).done],
      [false, true, false])
    check('its button copies the Google Ads access message', step({ lsa_budget_per_day: 20 }).action.kind, 'google-ads-access')
    const pub = (client, counts) => nextSteps(base({ client, counts })).steps.find((s) => s.key === 'google-publish')
    const conn = { google_ads_customer_id: '5192851350' }
    check('publishing the Google campaign waits on access, then is ours to do',
      [pub({ lsa_budget_per_day: 20 }).blocked, pub(conn).blocked, pub(conn).owner],
      [true, false, 'us'])
    check('it ticks itself off once the sync sees a running campaign', [pub(conn).done, pub(conn, { googleCampaigns: 2 }).done, pub(conn, { googleCampaigns: 2 }).detail], [false, true, '2 campaigns running.'])
  }
  check('no Business Profile step at all (taken off the list 2026-10-20)', keys(nextSteps(base({ client: { tier: 2 } }))).includes('gbp-access'), false)
}

// --- marked done by hand -------------------------------------------------------------
{
  const ctx = base({ client: { meta_ad_account_id: '1', meta_page_id: '2' }, link: { created_at: '2026-09-01', intake_submitted_at: '2026-09-02' }, payments: [{ payment_type: 'setup', status: 'paid' }], callSteps: [{ step_key: 'x' }] })
  const before = nextSteps(ctx)
  check('photos open and blocking creatives before the override', [before.steps.find((s) => s.key === 'photos').done, before.steps.find((s) => s.key === 'creatives').blocked], [false, true])
  const after = nextSteps({ ...ctx, overrides: [{ step_key: 'photos', done_at: '2026-09-18T10:00:00Z', done_by: 'Maria', note: 'Sent by text.' }] })
  const photos = after.steps.find((s) => s.key === 'photos')
  check('an override marks the step done and says who and when', [photos.done, photos.manual, photos.detail], [true, true, 'Marked done by Maria on 2026-09-18. Sent by text.'])
  check('and unblocks the step behind it', after.steps.find((s) => s.key === 'creatives').blocked, false)
  check('next moves on to creatives', after.next.key, 'creatives')
  const both = nextSteps({ ...ctx, client: { ...ctx.client, drive_folder_id: 'f' }, overrides: [{ step_key: 'photos', done_at: '2026-09-18', done_by: 'Maria' }] })
  check('data done plus an override keeps the data detail', both.steps.find((s) => s.key === 'photos').detail, 'Drive folder linked.')
  check('an override for a step that does not apply is ignored', nextSteps({ ...ctx, overrides: [{ step_key: 'google-ads-access', done_at: '2026-09-18' }] }).steps.some((s) => s.key === 'google-ads-access'), false)
}

// --- live on any channel ----------------------------------------------------------
{
  // MCL: had Meta ads, switched them off, runs Google Search now. Running,
  // with no Meta steps left on the plan and no Meta ads to be behind on.
  const left = nextSteps(
    base({
      client: { tier: 2, meta_ad_account_id: '1', meta_page_id: '2', drive_folder_id: 'f', meta_ads_active: false, google_ads_customer_id: '1234567890' },
      link: { created_at: '2026-09-01', intake_submitted_at: '2026-09-02' },
      payments: [{ payment_type: 'setup', status: 'paid' }],
      callSteps: [{ step_key: 'x' }],
      deliverables: [dl('meta-live')],
      counts: { googleCampaigns: 1 },
    })
  )
  check('left Meta for Google: launched, live on Google only', [left.launched, left.live, left.leftMeta], [true, { meta: false, google: true, lsa: false }, true])
  check('left Meta: the Meta steps come off the plan', keys(left).filter((k) => ['meta-access', 'creatives', 'publish', 'go-live'].includes(k)), [])
  check('left Meta: the Run step is there', keys(left).includes('weekly-kpis'), true)
  // Google went live first on a client who has not been through Meta yet:
  // launched, but every package includes Meta, so the Meta steps stay.
  const early = nextSteps(base({ client: { tier: 2, google_ads_customer_id: '1234567890' }, link: { created_at: '2026-09-01' }, counts: { googleCampaigns: 1 } }))
  check('Google first, Meta still to come: launched and the Meta steps stay', [early.launched, early.leftMeta, keys(early).includes('go-live')], [true, false, true])
  // Local Services only, never a Meta account: launched, Meta steps stay.
  const lsa = nextSteps(base({ client: { tier: 2, lsa_active: true, google_ads_customer_id: '1234567890' } }))
  check('Local Services live counts as launched', [lsa.launched, lsa.live.lsa], [true, true])
  check('nothing live is not launched, whatever is connected', nextSteps(base({ client: { google_ads_customer_id: '1234567890' } })).launched, false)
}

check('phases are in launch order', PHASES, ['Sign up', 'Access', 'Build', 'Launch', 'Run'])
check('currentPhase of nothing is Run', currentPhase([]), 'Run')
check('nextLine names the client wait', nextLine(nextSteps(base({ link: { created_at: '2026-09-10' } }))), 'Setup fee paid (waiting on the client)')

// --- the packages (src/lib/clientTiers.js) ---------------------------------
{
  const r1 = nextSteps(base({ client: { tier: 1 } }))
  check('tier 1: GHL is in every package, so the GHL steps show without ghl_plan', keys(r1).filter((k) => k.startsWith('ghl')), ['ghl-form', 'ghl-build', 'ghl-live'])
  check('tier 1: Meta only, no Google steps, no extras', keys(r1).filter((k) => /google|lsa|gbp|past-customers|ai-brain|automations/.test(k)), [])
  check('tier 1: the result says the tier', r1.tier, 1)
  const stray = nextSteps(base({ client: { tier: 1, meta_ad_account_id: '1', lsa_active: true, lsa_budget_per_day: 20, google_ads_customer_id: '1234567890' }, intake: { lsa_status: 'verified' } }))
  check('tier 1 on Meta: no Google or LSA steps even with LSA fields and a Google Ads id on the client', keys(stray).filter((k) => /google|lsa/.test(k)), [])
  const fee1 = nextSteps(base({ client: { monthly_fee: 1500, meta_ad_account_id: '1', lsa_active: true } }))
  check('a $1,500 fee with no tier set is Maintenance: no Google steps either', keys(fee1).filter((k) => /google|lsa/.test(k)), [])
  // Maintenance is ONE channel, Meta or Google ("the 1500 plan is only Meta
  // or Google, only one of those"): no Meta account and on Google is Google.
  const gOnly = nextSteps(base({ client: { tier: 1, google_ads_customer_id: '1234567890' } }))
  check('tier 1 with no Meta account and a Google Ads id is Google only: the Google steps, no Meta steps', [keys(gOnly).filter((k) => /google|lsa/.test(k)), keys(gOnly).filter((k) => ['meta-access', 'creatives', 'publish', 'go-live'].includes(k))], [['google-ads-access', 'google-publish'], []])
  const gLive = nextSteps(base({ client: { tier: 1, google_ads_customer_id: '1234567890', lsa_active: true }, counts: { googleCampaigns: 2 } }))
  check('tier 1 on Google with Local Services live: the LSA step too, and launched', [keys(gLive).includes('lsa-live'), gLive.launched, gLive.live], [true, true, { meta: false, google: true, lsa: true }])
  check('tier 1 with nothing connected yet is Meta by default', keys(nextSteps(base({ client: { tier: 1 } }))).includes('meta-access'), true)
  const movedOver = nextSteps(base({ client: { tier: 1, meta_ad_account_id: '1', meta_page_id: '2', meta_ads_active: false, google_ads_customer_id: '1234567890' }, deliverables: [dl('meta-live')], counts: { googleCampaigns: 1 } }))
  check('tier 1 that left Meta for Google: the Google steps on, the Meta steps off, running', [keys(movedOver).includes('google-publish'), keys(movedOver).includes('go-live'), movedOver.launched], [true, false, true])
  const unknown = nextSteps(base({ client: { lsa_active: true } }))
  check('no package at all still reads the LSA clues', keys(unknown).filter((k) => /google|lsa/.test(k)), ['google-ads-access', 'google-publish', 'lsa-live'])
  const r2 = nextSteps(base({ client: { tier: 2 } }))
  check('tier 2: Google Ads access and campaign, LSA live and the past customer list', keys(r2).filter((k) => /google|lsa|gbp|past-customers/.test(k)), ['google-ads-access', 'past-customers', 'google-publish', 'lsa-live'])
  check('tier 2: LSA waits on Google Ads access', r2.steps.find((s) => s.key === 'lsa-live').blockedBy, 'google-ads-access')
  check('tier 2: the past customer list waits on the GHL build', r2.steps.find((s) => s.key === 'past-customers').blockedBy, 'ghl-build')
  const r3 = nextSteps(base({ client: { tier: 3, ghl_active: true, ghl_plan: true, google_ads_customer_id: '1234567890', lsa_active: true } }))
  check('tier 3: the AI and the automations too', keys(r3).filter((k) => /ai-brain|automations/.test(k)), ['ai-brain', 'automations'])
  check('tier 3: LSA live reads the flag', r3.steps.find((s) => s.key === 'lsa-live').done, true)
  check('tier 3: the AI waits on the call, the automations on the GHL build (built here)', [r3.steps.find((s) => s.key === 'ai-brain').blockedBy, r3.steps.find((s) => s.key === 'automations').blockedBy], ['onboarding-call', null])
  const guessed = nextSteps(base({ client: { monthly_fee: 2500 } }))
  check('a $2,500 fee with no tier set is read as the Whole Chain', [guessed.tier, keys(guessed).includes('past-customers')], [2, true])
  const marked = nextSteps(base({ client: { tier: 3 }, overrides: [{ step_key: 'ai-brain', done_by: 'Kyle', done_at: '2026-09-10T00:00:00Z' }] }))
  check('a manual-only step is done when marked, and says who', [marked.steps.find((s) => s.key === 'ai-brain').done, marked.steps.find((s) => s.key === 'ai-brain').detail.includes('Kyle')], [true, true])
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
