// The message sent to a client to get us access to their Meta assets.
//
// It asks THEM to grant access from their end. That is a deliberate return to
// where this started, after checking whether the CRM could send the requests
// itself instead. It mostly cannot, and the half that works is not worth the
// manual step it would add:
//
//   POST /{business_id}/client_pages          WORKS. Meta accepted the call and
//     only rejected the deliberately-invalid page id it was probed with
//     ("Param page_id must be a valid page ID"), so Page requests really can be
//     sent from here.
//
//   POST /{business_id}/client_ad_accounts    BLOCKED. "(#3) Application does
//     not have the capability to make this API call." That is an app-level
//     refusal, not a bad parameter -- most likely the same development-access
//     tier that limits the ads API, which Advanced Access would lift.
//
//   client_instagram_accounts                 DOES NOT EXIST, read or write.
//     Instagram access is not its own request; it travels with the Page.
//
// So the ad account -- the one asset nothing can be built without -- has to be
// granted by the client whatever we do. Automating only the Page would mean a
// button to press per client AND a client still doing the sharing flow for the
// ad account: more moving parts, same waiting.
//
// WHAT ACTUALLY FIXES THE HALF-ACCESS PROBLEM is not the direction of the
// request, it is that the old message let someone believe they were finished
// when they were not. Two things go wrong, in this order:
//
//   1. The permission level. Meta defaults these toggles to partial access, so
//      a client can share all four assets and still leave us unable to build
//      anything. It looks completely done from their side.
//   2. A missed asset, usually the ad account, because it is on a different
//      row of the same screen from the Page.
//
// This version therefore leads with the count, names the permission trap before
// the steps rather than after, and ends by asking them to say when they are
// done -- because we can read back exactly what landed and chase the specific
// gap instead of asking them to check again.

export const BUSINESS_ID_PLACEHOLDER = '[YOUR BUSINESS PORTFOLIO ID]'

// Shown to whoever sends the message, not to the client. The failure is
// specific and repeated, so it is worth naming where it will be read.
export const META_ACCESS_WATCHOUTS = [
  'Meta defaults these toggles to partial access. A client can share all four assets and still leave us unable to build anything — and it looks finished from their side.',
  'The ad account is the one most often missed, and it is the one nothing works without.',
  'When they say they are done, check your end before replying — what actually landed is visible in Business Settings → Partners, and it is much easier to chase one named gap than to ask them to look again.',
]

export function buildMetaSetupMessage(businessId) {
  const id = String(businessId || '').trim() || BUSINESS_ID_PLACEHOLDER

  return `Getting your Meta ads set up — about two minutes on your end

Before we can build anything we need access to your Facebook and Instagram assets. Meta only lets the business owner grant this, so it has to come from you.

THERE ARE FOUR THINGS TO SHARE, AND ONE SETTING THAT CATCHES EVERYONE

The four:
  1. Ad account
  2. Facebook Page
  3. Instagram account
  4. Pixel / dataset — only if you already have one

The setting: each one has a permission level, and Meta preselects a partial one. If you leave the default we will be able to look at the account but not build in it, which looks completely fine on your side and blocks everything on ours. Please turn on FULL CONTROL for each of the four. If you see a "Full control" toggle, switch it on; if you see a list of tasks, tick them all.

Add us as a PARTNER, not as a person. Partner access belongs to our agency, so our whole team and our tools can work with it. Adding an individual by email only works while that one person is logged in and dies with their account.

THE STEPS
  1. Go to business.facebook.com and make sure your business is selected top-left.
  2. Click Settings (bottom-left), then open Partners.
  3. Click Add, then "Give a partner access to your assets".
  4. Enter our business portfolio ID: ${id}
  5. Select each of the four assets above and give Full control on each.
  6. Click Save changes.

Nothing to email — the invitation reaches us automatically.

WHEN YOU'RE DONE, JUST REPLY "DONE"
I'll check straight away and confirm everything came through. If one is missing or the permission level is short, I'll tell you exactly which one rather than making you go back through it all.

IF YOU CANNOT FIND THE PARTNERS SCREEN
Some accounts hide it. In that case: Settings → People → Invite people, enter ejretreats1@gmail.com, give Full control, and assign the same four assets. Tell me if you had to do it this way, because we will need to move it to partner access later.

IF YOU'VE NEVER RUN ADS AND HAVE NO AD ACCOUNT
Say so and skip the ad account — we'll sort that out separately.

WHAT HAPPENS NEXT
Once access is through we handle the rest: campaign structure, audiences, creative, budgets and ongoing management. Nothing goes live and nothing spends without you knowing.

Reply here or text me if Meta throws anything odd at you. Happy to jump on a five-minute call and do it together.`
}
