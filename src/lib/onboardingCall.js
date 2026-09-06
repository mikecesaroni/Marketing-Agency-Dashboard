// The live onboarding call, as a sheet worked left to right.
//
// Where this comes from. A home-services owner is hiring an agency because
// they are not the technical one, so a long document of "please grant us
// access to X, Y and Z" confuses them and makes the first weeks feel like
// homework. The agencies that keep clients do the opposite: one 60 to 90
// minute Zoom, the owner joins from the Zoom app, the agency requests control
// of their screen and gets every access live while making a strong first
// impression. Everything not captured on the call goes into one email thread.
// The agency follows the same sheet every time, so nothing is forgotten and
// the call is over in an hour instead of dragging across a week of texts.
//
// This file is that sheet. Each step has a title, the one-line "how", and
// where the CRM can already see the answer, an `auto` function that ticks it
// without anyone clicking. The ticks a person makes are stored per client in
// onboarding_call_steps; the derived ones never are.
//
// Pure on purpose: scripts/check-onboarding-call.mjs imports it, so nothing
// here may touch the DOM, React or supabaseClient. The component passes in a
// ctx built from the client row, the intake, the onboarding link, the GHL
// setup row and the two URLs.

export const AGENCY_NAME = 'The Working Class Marketing'

// The address we ask clients to add inside Business Manager when the Partner
// screen is hidden. Kept in step with src/lib/metaSetupMessage.js.
export const TEAM_EMAIL = 'ejretreats1@gmail.com'

const yes = (v) => v === true || /^(yes|true|y)$/i.test(String(v || '').trim())

// ctx: { client, intake, link, ghl, driveUrl, onboardingUrl, closerName }
export const CALL_SECTIONS = [
  {
    key: 'before',
    title: 'Before the call',
    intro: 'Set up so the call itself is an hour of doing, not asking.',
    steps: [
      {
        key: 'thread',
        title: 'Start one email thread with the owner',
        how: 'Everything you do not capture live on the call gets sent there. One thread, not a trail of texts. A group text alongside it is fine for quick replies.',
      },
      {
        key: 'precall_email',
        title: 'Send the pre-call email',
        how: 'The onboarding form link and the photos folder, nothing else. Do not send a list of access requests; that is what the call is for.',
        copy: 'preCallEmail',
      },
      {
        key: 'budget',
        title: 'Daily ad budget agreed',
        how: 'This comes from the closing call. If it is not written down before the onboarding call, the call turns into a sales call.',
        auto: (ctx) => Number(ctx.client?.meta_budget_per_day || 0) > 0 || Number(ctx.client?.lsa_budget_per_day || 0) > 0,
      },
      {
        key: 'zoom',
        title: 'Book a 60 to 90 minute Zoom, and ask them to join from the Zoom app',
        how: 'From the app, you can ask to control their screen. That is the difference between a one-hour call and telling someone over the phone to "tap the top left". Remote control does not work from a browser join.',
      },
    ],
  },
  {
    key: 'open',
    title: 'Opening',
    intro: 'Two minutes. Warm, then straight into it.',
    steps: [
      {
        key: 'intro',
        title: 'Introduce yourself and who they will deal with from now on',
        how: 'Ask who they spoke to on the sales side, say you were filled in and are excited, name the one or two people they will deal with for everything going forward, then move on. Owners are busy; they respect getting to it.',
        copy: 'callOpening',
      },
      {
        key: 'control',
        title: 'Have them share their screen and request control',
        how: 'Zoom: they share, you click "Request remote control". You drive from here. They watch, and they learn where things are without having to remember any of it.',
      },
    ],
  },
  {
    key: 'ghl',
    title: 'GoHighLevel',
    intro: 'Get them in, point them at the videos, connect their calendar.',
    onlyIf: (ctx) => Boolean(ctx.client?.ghl_plan),
    steps: [
      {
        key: 'ghl_form',
        title: 'GHL setup form back',
        how: 'Legal name, address, EIN and the rest, needed for texting registration. Chase it on the call if it is not back.',
        auto: (ctx) => Boolean(ctx.link?.ghl_submitted_at || ctx.ghl?.completed_at),
      },
      {
        key: 'ghl_user',
        title: 'Add them as a user and sign them in live',
        how: 'Adding a user sends an automatic email; have them open it on the call. A Google email signs in with "Sign in with Google" and never needs a password. Anything else, set the password together right there.',
      },
      {
        key: 'ghl_videos',
        title: 'Show them the walkthrough videos',
        how: 'Pre-recorded videos of how the system works, linked in their GHL side menu, save the same twenty minutes on every onboarding. Tell them: watch these, then ask us anything.',
      },
      {
        key: 'ghl_calendar',
        title: 'Connect their calendar',
        how: 'Google, Outlook, iCloud or Calendly. Appointment confirmations and reminders should go out from GHL so everything is tracked in one place.',
      },
      {
        key: 'ghl_live',
        title: 'GHL account live',
        how: 'Flip the switch at the top of this page once the account is built and they are in.',
        auto: (ctx) => Boolean(ctx.client?.ghl_active),
      },
    ],
  },
  {
    key: 'meta',
    title: 'Meta',
    intro: 'Find the right portfolio first. Most access problems are the wrong one.',
    steps: [
      {
        key: 'fb_page_setup',
        title: 'Confirm the business Page is connected to their personal profile',
        how: 'On facebook.com, on their screen: Settings, then Page setup, near the bottom. If the Page is there, it shows which business portfolio it belongs to, with the portfolio name and icon. Write that name down. If there is no Page here, they do not have the access they think they have.',
      },
      {
        key: 'bm_select',
        title: 'Open that portfolio at business.facebook.com/select',
        how: 'The /select path lists every portfolio they can see. Pick the one named in Page setup, not the first one.',
      },
      {
        key: 'bm_partner',
        title: 'Give the agency access to the Page, Instagram and ad account',
        how: `Business settings, then Partners, then "Give a partner access to your assets", with our Business Portfolio ID, full control on the Page, the Instagram account and the ad account. If the Partners screen is hidden, add ${TEAM_EMAIL} under People with full control instead, and note that it needs moving to partner access later.`,
        auto: (ctx) => Boolean(ctx.client?.meta_ad_account_id && ctx.client?.meta_page_id),
      },
      {
        key: 'why_admin',
        title: 'Explain why full control, if they ask',
        how: 'Meta only emails the account admins when something breaks, like a payment failure. With less than admin, the ads stop and nobody is told. That is the whole reason.',
        copy: 'whyAdmin',
      },
      {
        key: 'twofa',
        title: 'Two-factor authentication on for everyone in the portfolio, Instagram included',
        how: 'Running ads attracts account takeover attempts. Every person in the portfolio turns on 2FA, and because Instagram can sign into the portfolio too, they turn it on in the Instagram app as well. Tell them never to click links in messages claiming to be from Meta.',
      },
      {
        key: 'targeting',
        title: 'Map the service area with them',
        how: 'Pull up a map around their address and ask which towns the good calls come from and which they will not drive to. Put the answer in the targeting section below.',
        auto: (ctx) => Boolean(String(ctx.intake?.target_cities || '').trim() || Number(ctx.intake?.service_radius_miles || 0) > 0),
      },
      {
        key: 'meta_live',
        title: 'Meta ads live',
        how: 'The switch at the top of this page, once the first campaign is running.',
        auto: (ctx) => Boolean(ctx.client?.meta_ads_active),
      },
    ],
  },
  {
    key: 'google',
    title: 'Google',
    intro: 'Three accesses, usually all behind the same Google account.',
    steps: [
      {
        key: 'gbp_owner',
        title: 'Find which Google account owns the Business Profile',
        how: 'Google the business name and state. In the profile card on the right, scroll to "Own this business?" and click it. Google shows the masked owner email, like "con•••••@gmail.com". Ask the owner which account that is and have them sign into it.',
      },
      {
        key: 'gbp_access',
        title: 'Business Profile access granted',
        how: 'Signed in as the owning account, business.google.com, find the listing, People and access, add our email as Manager. Manager, not Owner. Then flip the Google Business switch above when the profile work starts.',
        auto: (ctx) => Boolean(ctx.client?.gbp_optimized) || null,
      },
      {
        key: 'search_console',
        title: 'Search Console access',
        how: 'Same Google account nine times out of ten. Most owners have never set it up; if so, add the site and verify it right there.',
      },
      {
        key: 'analytics',
        title: 'Google Analytics access',
        how: 'Same account again. If it does not exist, create the property on the call and note that the tag still needs adding to the site.',
      },
    ],
  },
  {
    key: 'site',
    title: 'Website and domain',
    intro: 'Two separate logins, and owners often do not know which company holds which.',
    steps: [
      {
        key: 'site_access',
        title: 'Website admin access',
        how: 'WordPress, Wix or Squarespace. Send ourselves an admin invite from inside their account while you have their screen. If you do not know where the invite lives on that platform, a sixty-second search does.',
        auto: (ctx) => (yes(ctx.intake?.has_website_access) ? true : null),
      },
      {
        key: 'domain_dns',
        title: 'Domain registrar access, for DNS records',
        how: 'GoDaddy, Cloudflare, Wix, wherever the domain lives. The only reason is to add a few DNS records so the automated emails GHL sends do not land in spam. Say exactly that.',
      },
      {
        key: 'privacy_url',
        title: 'Privacy policy page on their site',
        how: 'Meta refuses to create a lead form without one. Find the page or note that one has to be added, and put the URL on the client record.',
        auto: (ctx) => Boolean(String(ctx.client?.privacy_policy_url || '').trim()),
      },
    ],
  },
  {
    key: 'leads',
    title: 'Photos and other lead sources',
    intro: 'Stickiness comes from being the one place they look.',
    steps: [
      {
        key: 'photos',
        title: 'Photos folder linked and being filled',
        how: 'Job-site photos, trucks, the owner and team, shot in daylight. Everything the Ad Studio builds comes from this folder, so an empty folder means stock-looking ads.',
        auto: (ctx) => Boolean(ctx.client?.drive_folder_id),
      },
      {
        key: 'third_party',
        title: 'Route their other lead sources into GHL',
        how: 'Angi, Thumbtack, Yelp, the website form, whatever else brings calls. If every lead lands in the same place, the owner stops looking in four places and stops thinking about cancelling.',
        onlyIf: (ctx) => Boolean(ctx.client?.ghl_plan),
      },
    ],
  },
  {
    key: 'wrap',
    title: 'Wrap up',
    intro: 'Leave them certain about what happens next.',
    steps: [
      {
        key: 'recap',
        title: 'Send the recap in the thread',
        how: 'What was done on the call, what is still outstanding and who owes it, and when they will hear from you next. Generated from the sheet as it stands.',
        copy: 'recapEmail',
      },
    ],
  },
]

/** Sections that apply to this client, with the steps that apply. */
export function visibleSections(ctx, sections = CALL_SECTIONS) {
  return sections
    .filter((s) => !s.onlyIf || s.onlyIf(ctx))
    .map((s) => ({ ...s, steps: s.steps.filter((st) => !st.onlyIf || st.onlyIf(ctx)) }))
    .filter((s) => s.steps.length > 0)
}

/**
 * The state of one step: 'auto' when the CRM can see it is done, 'done' when
 * a person ticked it, otherwise 'open'. An auto step that is not yet true is
 * still tickable by hand, because the CRM's view can lag the call ("we granted
 * it, the sync has not run").
 */
export function stepState(step, ctx, doneKeys) {
  if (step.auto && step.auto(ctx) === true) return 'auto'
  if (doneKeys?.has?.(step.key) || (Array.isArray(doneKeys) && doneKeys.includes(step.key))) return 'done'
  return 'open'
}

export function callProgress(ctx, doneKeys, sections = CALL_SECTIONS) {
  const steps = visibleSections(ctx, sections).flatMap((s) => s.steps)
  const done = steps.filter((st) => stepState(st, ctx, doneKeys) !== 'open').length
  return { done, total: steps.length, pct: steps.length ? Math.round((100 * done) / steps.length) : 0 }
}

/** Titles of what is still open, grouped by section, for the recap. */
export function openItems(ctx, doneKeys, sections = CALL_SECTIONS) {
  return visibleSections(ctx, sections)
    .map((s) => ({
      section: s.title,
      steps: s.steps.filter((st) => stepState(st, ctx, doneKeys) === 'open' && !st.copy).map((st) => st.title),
    }))
    .filter((s) => s.steps.length > 0)
}

function firstName(ctx) {
  const owner = String(ctx.intake?.owner_name || ctx.ghl?.authorized_rep_name || '').trim()
  return owner.split(/\s+/)[0] || ''
}

// ---- Copy blocks ------------------------------------------------------------

export function preCallEmail(ctx) {
  const name = firstName(ctx)
  const business = String(ctx.client?.name || 'your business').trim()
  const lines = [
    `Hi${name ? ` ${name}` : ''},`,
    '',
    `Looking forward to our onboarding call for ${business}. Two quick things before then, and they are the only two:`,
    '',
    `1. Our onboarding form. About ten minutes, and it is how we learn what you sell, who you sell it to and what makes you different, so the ads sound like you.${ctx.onboardingUrl ? `\n   ${ctx.onboardingUrl}` : ''}`,
    '',
    `2. Photos. Anything you have of real jobs, your trucks, you and your team. Phone photos are perfect. Drop them in this folder and keep adding as you go.${ctx.driveUrl ? `\n   ${ctx.driveUrl}` : ''}`,
    '',
    'On the call we will get everything else set up together on screen, so there is nothing to prepare beyond that. Please join from the Zoom app rather than the browser so I can drive your screen when we get into the account settings.',
    '',
    'See you then,',
    AGENCY_NAME,
  ]
  return lines.join('\n')
}

export function callOpening(ctx) {
  const name = firstName(ctx)
  const closer = String(ctx.closerName || '').trim()
  const business = String(ctx.client?.name || '').trim()
  return [
    `${name ? `${name}, ` : ''}good to meet you. Who did you talk to on our side${closer ? `, ${closer}` : ''}? They filled me in${business ? ` on ${business}` : ''} and we are excited to get this moving.`,
    'I am the person you will deal with for everything from here on. Anything you need, you come to me.',
    'I know you are busy, so we will get straight into it. Can you share your screen? I am going to ask to control it so you do not have to click around while I talk.',
  ].join('\n\n')
}

export function whyAdmin() {
  return 'Meta only emails the admins of an account when something breaks, like a card being declined. If we have anything less than full control, your ads can stop and nobody gets told. We check the account every day either way, but the email is the alarm, and we need to be on it.'
}

export function recapEmail(ctx, doneKeys) {
  const name = firstName(ctx)
  const open = openItems(ctx, doneKeys)
  const lines = [`Hi${name ? ` ${name}` : ''},`, '', 'Thanks for the time today. Here is where everything stands.', '']
  const doneTitles = visibleSections(ctx)
    .flatMap((s) => s.steps)
    .filter((st) => stepState(st, ctx, doneKeys) !== 'open' && !st.copy)
    .map((st) => st.title)
  if (doneTitles.length) {
    lines.push('DONE ON THE CALL')
    for (const t of doneTitles) lines.push(`- ${t}`)
    lines.push('')
  }
  if (open.length) {
    lines.push('STILL TO DO')
    for (const group of open) {
      for (const t of group.steps) lines.push(`- ${group.section}: ${t}`)
    }
    lines.push('')
    lines.push('Reply to this thread with anything on your side of that list, and I will chase the rest from here.')
  } else {
    lines.push('Nothing outstanding. We have everything we need to build.')
  }
  lines.push('', 'You will hear from me within the week with the first look at the ads.', '', AGENCY_NAME)
  return lines.join('\n')
}

export const COPY_BLOCKS = { preCallEmail, callOpening, whyAdmin, recapEmail }
