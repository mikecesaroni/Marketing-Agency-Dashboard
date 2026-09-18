// What is next for a client, worked out from what the CRM already knows.
//
// The question every screen was answering a different way: the dashboard had
// six small lists ("GHL waiting on the client", "Meta not live yet", ...), the
// Deliverables page had eight seeded rows per client, and the client page had
// toggles, panels and forms in a long scroll. Each told part of the story and
// none said the one thing a teammate needs when they open a client: WHAT IS
// THE NEXT MOVE, WHOSE IS IT, AND WHAT DO I CLICK TO DO IT.
//
// This is the single place that answers it. It reads the client row, the
// intake, the onboarding link, the GHL setup, the seeded deliverables, the
// payment state and a few counts, and returns the launch pipeline as steps:
// each done or not, blocked by what, owned by us or by the client, with the
// one action that moves it. The client page's Next-up bar, the Deliverables
// board and the dashboard all render this list, so they can never disagree.
//
// Pure: scripts/check-next-steps.mjs runs it in Node.

import { GHL_BACKEND_KEYS } from './adsReady.js'

export const OWNER = { us: 'us', client: 'client' }

export const PHASES = ['Sign up', 'Access', 'Build', 'Launch', 'Run']

// The number of onboarding answers that count as "filled in" when the link
// row has no submitted stamp (a form filled on the call, not through the link).
const INTAKE_FILLED_MIN = 8

const INTAKE_KEYS = [
  'business_name',
  'contact_phone',
  'service_area',
  'services_offered',
  'most_profitable_service',
  'ideal_customer',
  'why_people_choose',
  'offer_headline',
  'current_offers_guarantees',
  'target_cities',
  'main_goal',
  'leads_go_to',
]

function filled(v) {
  return v !== null && v !== undefined && String(v).trim() !== ''
}

function answered(intake) {
  if (!intake) return 0
  return INTAKE_KEYS.filter((k) => filled(intake[k])).length
}

function daysBetween(a, b) {
  const da = new Date(a)
  const db = new Date(b)
  if (Number.isNaN(da) || Number.isNaN(db)) return null
  return Math.max(0, Math.floor((db - da) / 86400000))
}

const GHL_LABELS = {
  'ghl-a2p': 'A2P registration',
  'ghl-template': 'template',
  'ghl-meta-form': 'Meta form wired',
  'ghl-sms': 'SMS follow-up',
}

/**
 * ctx:
 *   client        clients row (with meta_*, ghl_*, lsa_*, gbp_optimized, drive_folder_id, setup_fee)
 *   intake        onboarding_intake row or null
 *   link          latest onboarding_links row or null ({created_at, intake_submitted_at, ghl_submitted_at})
 *   ghl           ghl_setup row or null
 *   ghlMissing    required GHL fields still blank (array), when known
 *   deliverables  this client's deliverables rows ({template_key, status, title})
 *   payments      client_payment_state rows for this client
 *   callSteps     onboarding_call_steps rows (any length means the call happened)
 *   counts        { photos, savedAds, publishedAds, kpisThisWeek, reportThisMonth }
 *   today         'YYYY-MM-DD'
 */
export function nextSteps(ctx) {
  const c = ctx.client || {}
  const intake = ctx.intake || null
  const link = ctx.link || null
  const dl = ctx.deliverables || []
  const pay = ctx.payments || []
  const counts = { photos: 0, savedAds: 0, publishedAds: 0, kpisThisWeek: 0, reportThisMonth: 0, ...(ctx.counts || {}) }
  const today = ctx.today || new Date().toISOString().slice(0, 10)

  const dlDone = (key) => dl.some((d) => d.template_key === key && d.status === 'done')
  const dlOpen = (keys) => keys.filter((k) => dl.some((d) => d.template_key === k) && !dlDone(k))

  const onPlan = Boolean(c.ghl_plan)
  const setupRows = pay.filter((p) => p.payment_type === 'setup')
  const setupPaid = setupRows.some((p) => p.status === 'paid')
  const setupApplies = setupRows.length > 0 || Number(c.setup_fee) > 0

  const formDone = Boolean(link?.intake_submitted_at) || answered(intake) >= INTAKE_FILLED_MIN
  const callDone = (ctx.callSteps || []).length > 0 || filled(intake?.call_notes)
  const metaAccount = Boolean(c.meta_ad_account_id)
  const metaPage = Boolean(c.meta_page_id)
  const metaDone = metaAccount && metaPage
  const photosDone = Boolean(c.drive_folder_id) || counts.photos >= 3
  const ghlFormDone = Boolean(link?.ghl_submitted_at) || (Array.isArray(ctx.ghlMissing) && ctx.ghlMissing.length === 0 && Boolean(ctx.ghl))
  const ghlOpen = dlOpen(GHL_BACKEND_KEYS)
  const ghlBuilt = Boolean(c.ghl_active) || (GHL_BACKEND_KEYS.some((k) => dl.some((d) => d.template_key === k)) && ghlOpen.length === 0)
  const creativesDone = (dlDone('meta-statics') && dlDone('meta-video')) || counts.savedAds >= 3
  const publishedDone = counts.publishedAds > 0 || Boolean(c.meta_ads_active) || dlDone('meta-live')
  const liveDone = Boolean(c.meta_ads_active)
  const lsaApplies = Number(c.lsa_budget_per_day) > 0 || Boolean(c.lsa_active) || filled(intake?.lsa_status) || Number(intake?.lsa_ad_budget_per_day) > 0
  const gbpApplies = intake ? intake.has_google_business !== false : true

  const steps = []
  const add = (s) => steps.push(s)

  // ---- SIGN UP ----------------------------------------------------------------
  add({
    key: 'setup-fee',
    phase: 'Sign up',
    title: 'Setup fee paid',
    owner: OWNER.client,
    applies: setupApplies,
    done: setupPaid,
    action: { kind: 'payments', label: 'Open Payments' },
    detail: setupPaid ? 'Paid.' : setupRows.length ? `${setupRows.filter((p) => p.status !== 'paid').length} setup invoice open.` : 'No setup invoice on file yet.',
  })
  add({
    key: 'onboarding-form',
    phase: 'Sign up',
    title: 'Onboarding form filled in',
    owner: OWNER.client,
    applies: true,
    done: formDone,
    action: { kind: 'send-onboarding', label: 'Copy the onboarding message' },
    detail: formDone
      ? `Submitted${link?.intake_submitted_at ? ` ${String(link.intake_submitted_at).slice(0, 10)}` : ''}.`
      : link
        ? `Link sent ${String(link.created_at).slice(0, 10)}, ${answered(intake)} of ${INTAKE_KEYS.length} key answers in so far.`
        : 'No link sent yet.',
    waitingSince: !formDone && link?.created_at ? link.created_at : null,
  })
  add({
    key: 'onboarding-call',
    phase: 'Sign up',
    title: 'Onboarding call done',
    owner: OWNER.us,
    applies: true,
    done: callDone,
    blockedBy: formDone ? null : 'onboarding-form',
    action: { kind: 'call', label: 'Open the call script' },
    detail: callDone ? 'Notes on file.' : 'Run the live call from the client page; it fills the brief as you go.',
  })

  // ---- ACCESS -----------------------------------------------------------------
  add({
    key: 'meta-access',
    phase: 'Access',
    title: 'Meta ad account and Page connected',
    owner: OWNER.client,
    applies: true,
    done: metaDone,
    action: { kind: 'meta-access', label: 'Copy the Meta access message' },
    detail: metaDone
      ? 'Ad account and Page in.'
      : metaAccount
        ? 'Ad account in. Facebook Page ID still missing (an ad is a Page post).'
        : metaPage
          ? 'Page in. Ad account still missing.'
          : 'Neither in yet.',
  })
  add({
    key: 'photos',
    phase: 'Access',
    title: 'Photos and logo shared',
    owner: OWNER.client,
    applies: true,
    done: photosDone,
    action: { kind: 'send-onboarding', label: 'Copy the photo request' },
    detail: photosDone
      ? c.drive_folder_id
        ? 'Drive folder linked.'
        : `${counts.photos} photos uploaded.`
      : counts.photos > 0
        ? `${counts.photos} photo${counts.photos === 1 ? '' : 's'} uploaded, no Drive folder yet.`
        : 'Nothing yet. The onboarding message asks for a shared Drive folder.',
  })
  if (onPlan) {
    add({
      key: 'ghl-form',
      phase: 'Access',
      title: 'GHL account details sent back',
      owner: OWNER.client,
      applies: true,
      done: ghlFormDone,
      action: { kind: 'send-ghl', label: 'Copy the GHL setup message' },
      detail: ghlFormDone
        ? 'EIN, address and contact in.'
        : Array.isArray(ctx.ghlMissing) && ctx.ghl
          ? `${ctx.ghlMissing.length} required field${ctx.ghlMissing.length === 1 ? '' : 's'} still blank.`
          : 'Not started.',
      waitingSince: !ghlFormDone && link?.created_at ? link.created_at : null,
    })
  }
  if (gbpApplies) {
    add({
      key: 'gbp-access',
      phase: 'Access',
      title: 'Google Business Profile access',
      owner: OWNER.client,
      applies: true,
      done: Boolean(c.gbp_optimized),
      action: { kind: 'gbp', label: 'Copy the GBP access message' },
      detail: c.gbp_optimized ? 'Optimized.' : 'Ask for manager access, then run the GBP agent brief.',
    })
  }
  if (lsaApplies) {
    add({
      key: 'lsa-access',
      phase: 'Access',
      title: 'Google LSA access',
      owner: OWNER.client,
      applies: true,
      done: Boolean(c.lsa_active),
      action: { kind: 'lsa-access', label: 'Copy the LSA access message' },
      detail: c.lsa_active ? 'Live.' : 'Ask for manager access to their LSA account.',
    })
  }

  // ---- BUILD ------------------------------------------------------------------
  if (onPlan) {
    add({
      key: 'ghl-build',
      phase: 'Build',
      title: 'GHL backend built',
      owner: OWNER.us,
      applies: true,
      done: ghlBuilt,
      blockedBy: ghlFormDone ? null : 'ghl-form',
      action: { kind: 'deliverables', label: 'Open the GHL items' },
      detail: ghlBuilt
        ? 'A2P, template, Meta form and SMS follow-up done.'
        : ghlOpen.length
          ? `Still open: ${ghlOpen.map((k) => GHL_LABELS[k] || k).join(', ')}.`
          : 'Not started.',
    })
    add({
      key: 'ghl-live',
      phase: 'Build',
      title: 'GHL account marked live',
      owner: OWNER.us,
      applies: true,
      done: Boolean(c.ghl_active),
      blockedBy: ghlBuilt ? null : 'ghl-build',
      action: { kind: 'ghl-toggle', label: 'Mark GHL live' },
      detail: c.ghl_active ? 'Live.' : 'Flip the switch once leads flow into the pipeline.',
    })
  }
  add({
    key: 'creatives',
    phase: 'Build',
    title: 'Ads built (statics and video)',
    owner: OWNER.us,
    applies: true,
    done: creativesDone,
    blockedBy: !metaDone ? 'meta-access' : !photosDone ? 'photos' : null,
    action: { kind: 'studio', label: 'Open the Ad Studio' },
    detail: creativesDone
      ? `${counts.savedAds} saved ad set${counts.savedAds === 1 ? '' : 's'}.`
      : counts.savedAds > 0
        ? `${counts.savedAds} saved so far. Aim for three statics and a video.`
        : 'Nothing built yet. The chat can write the first set from the brief.',
  })

  // ---- LAUNCH -----------------------------------------------------------------
  add({
    key: 'publish',
    phase: 'Launch',
    title: 'Published to Meta',
    owner: OWNER.us,
    applies: true,
    done: publishedDone,
    blockedBy: !creativesDone ? 'creatives' : onPlan && !c.ghl_active ? 'ghl-live' : null,
    action: { kind: 'publish', label: 'Open the Publish tab' },
    detail: publishedDone ? `${counts.publishedAds} ad${counts.publishedAds === 1 ? '' : 's'} in the account.` : 'Publish paused, then switch on in Ads Manager.',
  })
  add({
    key: 'go-live',
    phase: 'Launch',
    title: 'Meta ads live',
    owner: OWNER.us,
    applies: true,
    done: liveDone,
    blockedBy: publishedDone ? null : 'publish',
    action: { kind: 'meta-toggle', label: 'Mark Meta live' },
    detail: liveDone ? 'Spending.' : 'Switch the ads on in Ads Manager, then mark live here so the sync and reports pick them up.',
  })

  // ---- RUN --------------------------------------------------------------------
  if (liveDone) {
    add({
      key: 'weekly-kpis',
      phase: 'Run',
      title: 'This week’s KPIs logged',
      owner: OWNER.us,
      applies: true,
      done: counts.kpisThisWeek > 0,
      action: { kind: 'kpis', label: 'Log KPIs' },
      detail: counts.kpisThisWeek > 0 ? 'Logged.' : 'Meta syncs itself nightly; LSA and anything else is logged by hand.',
    })
    add({
      key: 'monthly-report',
      phase: 'Run',
      title: 'Monthly report sent',
      owner: OWNER.us,
      applies: Number(today.slice(8, 10)) >= 3,
      done: counts.reportThisMonth > 0,
      action: { kind: 'report', label: 'Open Reports' },
      detail: counts.reportThisMonth > 0 ? 'Sent this month.' : 'Not sent yet this month.',
    })
  }

  const active = steps.filter((s) => s.applies)
  const isBlocked = (s) => Boolean(s.blockedBy) && !active.find((x) => x.key === s.blockedBy)?.done
  for (const s of active) {
    s.blocked = !s.done && isBlocked(s)
    s.waitingDays = s.waitingSince ? daysBetween(s.waitingSince, today) : null
  }

  const open = active.filter((s) => !s.done && !s.blocked)
  const ours = open.filter((s) => s.owner === OWNER.us)
  const theirs = open.filter((s) => s.owner === OWNER.client)
  const done = active.filter((s) => s.done).length

  // The next move: the first unblocked step that is ours. If everything open
  // is the client's, the next move is the chase, and the first of those leads.
  const next = ours[0] || theirs[0] || null

  return {
    steps: active,
    next,
    ours,
    theirs,
    progress: { done, total: active.length, percent: active.length ? Math.round((done / active.length) * 100) : 0 },
    phase: currentPhase(active),
    launched: liveDone,
  }
}

/**
 * Where the client is: the earliest phase with an open step that is ours to
 * do now. A client-side wait (a GBP access request nobody has answered) can
 * sit in Access for weeks while we are already building, and calling that
 * client "Access" would hide the work in hand. With nothing of ours open, the
 * earliest phase with anything open; launched and quiet is Run.
 */
export function currentPhase(steps) {
  for (const p of PHASES) {
    if (steps.some((s) => s.phase === p && !s.done && !s.blocked && s.owner === OWNER.us)) return p
  }
  for (const p of PHASES) {
    if (steps.some((s) => s.phase === p && !s.done)) return p
  }
  return PHASES[PHASES.length - 1]
}

/** "Next: Copy the Meta access message (client)" for a row. */
export function nextLine(result) {
  if (!result?.next) return result?.launched ? 'Running. Nothing outstanding.' : 'Nothing outstanding.'
  const n = result.next
  return `${n.title}${n.owner === OWNER.client ? ' (waiting on the client)' : ''}`
}

/**
 * Sort key for a board: the clients that need us first, then those waiting
 * longest on a client, launched and quiet last.
 */
export function urgency(result) {
  if (!result) return 0
  if (result.ours.length > 0) return 3000 + result.ours.length * 10 + (100 - result.progress.percent) / 100
  if (result.theirs.length > 0) {
    const longest = Math.max(0, ...result.theirs.map((s) => s.waitingDays || 0))
    return 2000 + Math.min(999, longest)
  }
  return result.launched ? 0 : 1000
}
