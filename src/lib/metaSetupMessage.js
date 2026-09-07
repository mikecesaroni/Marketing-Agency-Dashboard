// The message sent to a client to get us access to their Meta assets.
//
// September 2026: the ask is now ADD ME AS A PERSON, and we share the assets to
// our business ourselves. The Partner route was tried across a dozen clients
// and failed in two ways at once, both invisible from the client's side:
//
//   1. Leads access is a separate switch in the partner sharing flow and
//      almost every client leaves it off (Tito's, Plumb Quick, Belk all came
//      through without it).
//   2. A partner grant gives our BUSINESS access and gives no PERSON a role on
//      the Page. GoHighLevel connects with a person's own Facebook login and
//      only lists Pages that person has a direct role on, so a Page that is
//      perfectly shared to the business never appears in GHL.
//
// A client who adds one of us by email with full control fixes both: the
// direct role is what GHL needs, and from inside their assets we can share
// everything to our business portfolio ourselves, ticking every task
// including Leads. It is also the shorter instruction for them.
//
// Kept from the earlier version: the permission trap is named before the
// steps (Meta preselects partial access and it looks finished from their
// side), and the message ends by asking them to say when they are done,
// because meta-access-check reads back exactly what landed.
//
// Background, still true: POST /{business_id}/client_ad_accounts is refused
// at the app level ("does not have the capability"), so the ad account can
// never be requested from our end. It has to be granted by the client, and
// that is the asset most often missed.

export const BUSINESS_ID_PLACEHOLDER = '[YOUR BUSINESS PORTFOLIO ID]'

// The Facebook login the client adds. A person, on purpose: see the header.
export const ACCESS_EMAIL = 'ejretreats1@gmail.com'

// Shown to whoever sends the message, not to the client. The failure is
// specific and repeated, so it is worth naming where it will be read.
export const META_ACCESS_WATCHOUTS = [
  'Meta defaults these toggles to partial access. A client can share everything and still leave us unable to build anything — and it looks finished from their side.',
  'The ad account is the one most often missed, and it is the one nothing works without.',
  'Once you are added as a person, share the Page and ad account to our business portfolio yourself (Business Settings → Partners on THEIR side, or Add People on ours) and tick Leads access. A partner grant alone never appears in GoHighLevel, because GHL lists the Pages your own login has a role on.',
  'When they say they are done, run the Meta access report before replying — it shows exactly what landed, and it is easier to chase one named gap than to ask them to look again.',
]

export function buildMetaSetupMessage(businessId, email = ACCESS_EMAIL) {
  const id = String(businessId || '').trim() || BUSINESS_ID_PLACEHOLDER

  return `Getting your Meta ads set up — about two minutes on your end

Before we can build anything we need access to your Facebook and Instagram assets. Meta only lets the business owner grant this, so it has to come from you.

THE SHORT VERSION
Add me as a person, with full control, on your Facebook Page and your ad account. That is it. Once I am in, I connect the rest of our tools from my side and you do not have to touch Meta again.

The email to add: ${email}

THE FOUR THINGS
  1. Facebook Page
  2. Ad account
  3. Instagram account (it usually rides along with the Page)
  4. Pixel / dataset — only if you already have one

THE ONE SETTING THAT CATCHES EVERYONE
Each asset has a permission level, and Meta preselects a partial one. If you leave the default I can look but not build, which looks completely fine on your side and blocks everything on ours. Please give FULL CONTROL on each. If you see a "Full control" toggle, switch it on; if you see a list of tasks, tick them all, including Leads.

THE STEPS, IF YOU USE BUSINESS SETTINGS
  1. Go to business.facebook.com and make sure your business is selected top-left.
  2. Click Settings (bottom-left), then People.
  3. Click Add people, enter ${email}, and choose Full control (admin).
  4. On the next screen assign the Page, the ad account, the Instagram account and the pixel, each with Full control.
  5. Click Invite. Nothing to email — the invite reaches me automatically.

THE STEPS, IF YOU JUST HAVE A FACEBOOK PAGE
  1. Open your Page, then Settings, then Page access.
  2. Under People with Facebook access, click Add new, enter ${email}, and switch on "Allow this person to have full control".
  3. For the ad account: go to adsmanager.facebook.com, Settings, Ad account roles, Add people, enter ${email}, and choose Admin.

WHEN YOU'RE DONE, JUST REPLY "DONE"
I'll check straight away and confirm everything came through. If one is missing or the permission level is short, I'll tell you exactly which one rather than making you go back through it all.

IF YOUR IT PERSON PREFERS PARTNER ACCESS
That works too: Settings → Partners → Add → "Give a partner access to your assets", our business portfolio ID is ${id}, and give Full control on each asset with Leads access switched on. Tell me if you went this way.

IF YOU'VE NEVER RUN ADS AND HAVE NO AD ACCOUNT
Say so and skip the ad account — we'll sort that out separately.

WHAT HAPPENS NEXT
Once access is through we handle the rest: campaign structure, audiences, creative, budgets and ongoing management. Nothing goes live and nothing spends without you knowing.

Reply here or text me if Meta throws anything odd at you. Happy to jump on a five-minute call and do it together.`
}
