/**
 * Ken's onboarding tasks, made the moment a client is added.
 *
 * "When we onboard new clients we always need a landing page made on GHL
 * with pixel and Google tracking, a GHL account created and the client
 * added as a user, and A2P verification. And when you add a client as a
 * user, message them and let them know how to log in, download the app and
 * turn on notifications, and send them the GHL how-to video. If it's the
 * $1,500 tier we just need the pixel integrated on the landing page; $2,500
 * and above we also need Google Ads tracking on the landing page."
 *
 * Titles read the way the board already does ("Express Home Services GHL
 * Landing Page + Meta & Google Ads Tracking"): the client first, then the
 * job. The package decides the tracking line. Due dates are counted from the
 * day the client is added; the offsets are here, in one place, to change.
 *
 * Pure, so scripts/check-onboarding-tasks.mjs runs it in Node. The rows are
 * what tasksData.createTask takes; createOnboardingTasks inserts them and
 * tells the channel.
 */

import { addDays } from './dates.js'

export const ONBOARDING_OWNER = 'Ken'
export const ONBOARDING_TAG = 'onboarding'

/** Days after the client is added that each task is due. */
export const DUE_IN_DAYS = { landing: 3, account: 2, a2p: 3, welcome: 3 }

/** The package tiers that get Google Ads tracking on the landing page: $2,500 and above. */
export const GOOGLE_TRACKING_FROM_TIER = 2

const clean = (s) => String(s || '').trim()

/** The landing page line for the package: Meta only on the $1,500 plan, Meta and Google from $2,500. */
export function landingPageTitle(clientName, tier) {
  const google = Number(tier) >= GOOGLE_TRACKING_FROM_TIER
  return `${clean(clientName)} GHL Landing Page + ${google ? 'Meta & Google Ads Tracking' : 'Meta Pixel'}`
}

/**
 * The four tasks for a client: { key, title, description, checklist, ... },
 * each the fields createTask takes. `today` is 'YYYY-MM-DD'.
 */
export function onboardingTasks(client, { today, by = '' } = {}) {
  const name = clean(client?.name) || 'New client'
  const tier = Number(client?.tier) || 0
  const google = tier >= GOOGLE_TRACKING_FROM_TIER
  const day = clean(today) || null
  const base = {
    status: 'todo',
    priority: 'normal',
    client_id: client?.id || null,
    assignees: [ONBOARDING_OWNER],
    tags: [ONBOARDING_TAG],
    start_date: day,
    created_by: clean(by) || null,
  }
  const due = (key) => (day ? addDays(day, DUE_IN_DAYS[key]) : null)
  const item = (text) => ({ id: `ob-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`, text, done: false })

  return [
    {
      ...base,
      key: 'landing',
      title: landingPageTitle(name, tier),
      description: google
        ? `Build the landing page on GHL. Connect the Meta pixel and Google Ads conversion tracking. ${tierWords(tier)}.`
        : `Build the landing page on GHL and connect the Meta pixel. ${tierWords(tier)}: no Google Ads tracking.`,
      checklist: google ? [item('Landing page built on GHL'), item('Meta pixel connected'), item('Google Ads tracking connected')] : [item('Landing page built on GHL'), item('Meta pixel connected')],
      due_date: due('landing'),
    },
    {
      ...base,
      key: 'account',
      title: `${name} GHL Account + Client Added as User`,
      description: 'Create the GHL sub-account and add the client as a user.',
      checklist: [item('GHL sub-account created'), item('Client added as a user')],
      due_date: due('account'),
    },
    {
      ...base,
      key: 'a2p',
      title: `${name} A2P Verification`,
      description: 'Submit A2P verification for their GHL number so their texts send.',
      checklist: [],
      due_date: due('a2p'),
    },
    {
      ...base,
      key: 'welcome',
      title: `${name} Welcome Message + GHL How-To Video`,
      description: 'Once they are added as a user, message the client: how to log in, download the app, turn on notifications. Send the GHL how-to video.',
      checklist: [item('How to log in'), item('Download the app'), item('Turn on notifications'), item('GHL how-to video sent')],
      due_date: due('welcome'),
    },
  ]
}

function tierWords(tier) {
  if (tier >= 3) return '$3,500 plan'
  if (tier === 2) return '$2,500 plan'
  if (tier === 1) return '$1,500 plan'
  return 'No tier picked yet'
}

/**
 * The wanted tasks a client does not have yet, by title, so making them
 * twice (a second add, a button pressed again) adds nothing. `existing` is
 * the client's tasks as rows { title, client_id }.
 */
export function missingOnboardingTasks(wanted, existing) {
  const have = new Set((existing || []).map((t) => clean(t?.title).toLowerCase()).filter(Boolean))
  return (wanted || []).filter((t) => !have.has(clean(t.title).toLowerCase()))
}
