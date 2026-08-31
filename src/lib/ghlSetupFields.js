// Field spec for the GoHighLevel setup form.
//
// One list, three consumers: the staff form, the client-facing page, and the
// plain-text summary that gets pasted into Claude to do the actual setup. Kept
// as data rather than JSX so those three can never drift apart.
//
// Where the fields came from, because none of this was invented:
//   - Ethan, 2026-08-29: "a universal form that they can fill out so we can get
//     started with their GHL. like email address and EIN for A2P"
//   - the six `TEMPLATE - set per client` custom values on the master snapshot
//     ([MASTER] Home Service CRM): company name, main phone, booking URL,
//     review link, service area, support email
//   - the GHL sub-account creation form: address, country, timezone
//   - A2P 10DLC registration requirements
//   - Ethan, 2026-08-31: an area code for the number the automated messages
//     send from, so it is not provisioned wherever Twilio happens to have stock

export const GHL_SETUP_SECTIONS = [
  {
    title: 'BUSINESS IDENTITY',
    blurb:
      'This is what your GoHighLevel account gets named and addressed with. Use the legal details exactly as they appear on your registration, not a shortened version.',
    fields: [
      ['legal_business_name', 'Legal business name', 'text', 'Exactly as registered with the IRS'],
      ['dba_name', 'Trading name / DBA', 'text', 'What customers call you, if different'],
      ['business_address', 'Street address', 'text', '123 Main St'],
      ['business_city', 'City', 'text', ''],
      ['business_state', 'State', 'text', 'e.g. TX'],
      ['business_postal_code', 'ZIP code', 'text', ''],
      ['business_country', 'Country', 'text', 'US'],
      ['timezone', 'Time zone', 'select', ''],
      ['main_phone', 'Main business phone', 'text', '(555) 123-4567'],
      // Asked here rather than in the A2P section because that section is
      // carrier paperwork -- a preference sitting among requirements reads like
      // a requirement. Next to the line they already have, "and the new one
      // should look like this" is the obvious question.
      [
        'preferred_area_code',
        'Area code you want your texting number to have',
        'text',
        'e.g. 512 \u2014 we match it if numbers are free there',
      ],
      ['support_email', 'Best email for us to use', 'email', 'you@yourcompany.com'],
    ],
  },
  {
    title: 'TEXT MESSAGE REGISTRATION (A2P)',
    blurb:
      'US carriers require every business to be registered before it can send text messages. Without this we cannot text your leads at all, and approval takes about a week, so this is the part worth doing carefully.',
    fields: [
      ['ein', 'EIN (federal tax ID)', 'text', '12-3456789'],
      ['business_entity_type', 'Business type', 'select', ''],
      ['website_url', 'Website address', 'text', 'https://yourcompany.com'],
      ['privacy_policy_url', 'Privacy policy page', 'text', 'https://yourcompany.com/privacy'],
      ['terms_url', 'Terms and conditions page', 'text', 'https://yourcompany.com/terms'],
      ['authorized_rep_name', 'Authorised representative', 'text', 'Usually the owner'],
      ['authorized_rep_email', 'Their email', 'email', ''],
      ['authorized_rep_phone', 'Their phone', 'text', ''],
      [
        'sms_opt_in_method',
        'How do customers agree to be texted?',
        'textarea',
        'e.g. a tick box on our website contact form, or they ask us to text them when they call',
      ],
    ],
  },
  {
    title: 'LINKS AND SERVICE AREA',
    blurb: 'These get written into your automated messages, so they need to be the real live links.',
    fields: [
      ['booking_url', 'Online booking link', 'text', 'Leave blank if you do not have one'],
      ['review_link', 'Google review link', 'text', 'The link that opens the review box'],
      ['service_area', 'Service area', 'textarea', 'Cities, counties or a radius you actually cover'],
      [
        'service_pricing',
        'Service call and job pricing',
        'textarea',
        'e.g. Diagnostic $89, drain clean from $300, water heater from $2,500. Rough numbers are fine.',
      ],
    ],
  },
  {
    title: 'ANYTHING ELSE',
    fields: [['notes', 'Anything we should know', 'textarea', 'Optional']],
  },
]

// US timezones GoHighLevel offers. Kept short on purpose: every client in the
// CRM is a US home-service business, and a 400-entry IANA list is a worse
// experience than six options for someone filling this in on a phone.
export const TIMEZONE_OPTIONS = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
]

export const ENTITY_TYPE_OPTIONS = [
  'Sole Proprietorship',
  'Partnership',
  'Limited Liability Company (LLC)',
  'Corporation',
  'Non-Profit',
]

export const SELECT_OPTIONS = {
  timezone: TIMEZONE_OPTIONS,
  business_entity_type: ENTITY_TYPE_OPTIONS,
}

// Every key the form owns, used to build empty state and to strip anything the
// server sent back that the form has no business writing again.
export const GHL_SETUP_KEYS = GHL_SETUP_SECTIONS.flatMap((s) => s.fields.map(([key]) => key))

// The fields that genuinely block work if they are missing. Deliberately short:
// A2P cannot be filed without the EIN and the legal name, and the sub-account
// cannot be created without a timezone. Everything else can be chased later
// without stalling the build.
export const GHL_REQUIRED_KEYS = [
  'legal_business_name',
  'business_address',
  'business_city',
  'business_state',
  'business_postal_code',
  'timezone',
  'main_phone',
  'support_email',
  'ein',
  'business_entity_type',
]

export function missingRequired(data) {
  return GHL_REQUIRED_KEYS.filter((key) => {
    const value = data[key]
    return value === null || value === undefined || String(value).trim() === ''
  })
}

export function emptyGhlSetup() {
  return Object.fromEntries(GHL_SETUP_KEYS.map((key) => [key, key === 'business_country' ? 'US' : '']))
}

// Merges a saved row into form state key by key. A row can be sparse, and
// assigning it wholesale would turn every unset field into null, which React
// treats as an uncontrolled input. Same reasoning as OnboardingIntakeForm.
export function mergeGhlSetup(base, row) {
  if (!row) return base
  const merged = { ...base }
  for (const key of GHL_SETUP_KEYS) {
    if (row[key] !== null && row[key] !== undefined) merged[key] = row[key]
  }
  return merged
}

// The handoff. This is the text Ethan described feeding to Claude to do the
// setup, so it is written to be read by something following instructions:
// every field labelled, missing ones called out by name rather than silently
// dropped, because a blank EIN is the single thing most likely to stall an
// A2P filing and it must not look like an oversight in the paste.
export function formatGhlSetup(data, clientName) {
  const blocks = []

  for (const section of GHL_SETUP_SECTIONS) {
    const lines = []
    for (const [key, label] of section.fields) {
      const value = data[key] === null || data[key] === undefined ? '' : String(data[key]).trim()
      if (!value) continue
      lines.push(value.includes('\n') ? `${label}:\n${value}` : `${label}: ${value}`)
    }
    if (lines.length > 0) {
      blocks.push(`${section.title}\n${'-'.repeat(section.title.length)}\n${lines.join('\n')}`)
    }
  }

  const missing = missingRequired(data)
  if (missing.length > 0) {
    const labels = new Map(
      GHL_SETUP_SECTIONS.flatMap((s) => s.fields.map(([key, label]) => [key, label]))
    )
    blocks.push(
      `STILL MISSING\n-------------\n${missing.map((k) => `- ${labels.get(k) || k}`).join('\n')}\n\nDo not invent values for these. Ask the client.`
    )
  }

  const header = clientName ? `GHL SETUP: ${clientName}` : 'GHL SETUP'
  return `${header}\n${'='.repeat(header.length)}\n\n${blocks.join('\n\n')}\n`
}

/**
 * Where a client is in the GoHighLevel build.
 *
 * Derived rather than stored. The two booleans on the client say whether we
 * are building it and whether it is live; everything between those is knowable
 * from the setup row that already exists, so there is no third status column to
 * keep in sync and nothing that can quietly go stale.
 *
 * Four states, and each one names a different next action:
 *
 *   off       not on the plan. They run their own GHL, or none. Shows nothing
 *             anywhere, which is the point of having the flag at all.
 *   waiting   on the plan, and we cannot start: the EIN, the legal name or the
 *             timezone is missing. The action is to chase the client, and the
 *             account-setup link is the thing to send.
 *   ready     on the plan, everything needed is in. The action is ours.
 *   live      built and running.
 */
export const GHL_STAGES = {
  off: { key: 'off', label: 'Not on GHL', tone: 'dim' },
  waiting: { key: 'waiting', label: 'GHL — waiting on client', tone: 'warning' },
  ready: { key: 'ready', label: 'GHL — ready to build', tone: 'info' },
  live: { key: 'live', label: 'GHL live', tone: 'success' },
}

export function ghlStage(client, setup) {
  if (!client?.ghl_plan) return GHL_STAGES.off
  if (client.ghl_active) return GHL_STAGES.live
  // No setup row at all is the same situation as an empty one: nothing has
  // been answered, so nothing can be built.
  if (!setup || missingRequired(setup).length > 0) return GHL_STAGES.waiting
  return GHL_STAGES.ready
}
