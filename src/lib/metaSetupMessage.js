// The message sent to a client to get us access to their Meta assets.
//
// IT ASKS THEM TO APPROVE, NOT TO SHARE. That is the whole point of this
// rewrite, and it is a change of direction rather than a change of wording.
//
// Meta allows the same access to be set up from either end:
//
//   THEY SHARE (what this used to ask). The client opens Business Settings,
//     finds Partners, enters our business ID, then picks which assets to share
//     and what permission level to give on each. Six screens, and three
//     separate places to under-grant. In practice they would share the Page and
//     not the ad account, or give partial access on the ad account, or share
//     everything at "Analyze" and nothing could be built. Every one of those
//     looks finished from their side.
//
//   WE REQUEST (what it asks now). We name the assets and the access level, and
//     Meta sends them a notification per asset with one Approve button. They
//     cannot pick a subset, because there is no picker -- the scope is already
//     in the request. Half-access stops being possible.
//
// Verified on the live API before rewriting: our business ID 1191797372977574
// can already read both /client_pages and /client_ad_accounts, which is the
// agency-to-client asset relationship these requests create. The token has
// business_management, so the requesting side genuinely is available to us.
//
// One thing still has to come from them: the ad account ID. A Page can be found
// from its public URL, and an Instagram account is usually reachable through the
// Page, but an ad account ID is not discoverable from outside -- so the message
// asks for that single number and nothing else. Pretending zero input is needed
// would send someone into a dead end.
//
// The old share-with-partner flow is kept at the bottom, because it does work
// and some clients will already have started down it.

export const BUSINESS_ID_PLACEHOLDER = '[YOUR BUSINESS PORTFOLIO ID]'

/**
 * What we do, before sending the message.
 *
 * The requesting is our work now, so it needs writing down somewhere the person
 * doing it will look. Shown in the Meta setup panel next to the copy button.
 */
export const META_REQUEST_STEPS = [
  'Find their Facebook Page from its public URL — you do not need anything from them for this.',
  'In Business Settings → Accounts → Pages, choose Add → Request access to a Page, paste the Page, and ask for full control.',
  'Do the same under Accounts → Ad accounts once they send the ad account ID, asking for Manage campaigns.',
  'Instagram usually arrives attached to the Page. If it does not, request it under Accounts → Instagram accounts.',
  'Then send the message below, so they know what they are approving and that it is expected.',
]

export function buildMetaSetupMessage(businessId) {
  const id = String(businessId || '').trim() || BUSINESS_ID_PLACEHOLDER

  return `Getting your Meta ads set up — one small thing from you

We need access to your Facebook and Instagram assets before we can build anything. I've set this up so it's mostly on our end rather than yours.

WHAT I NEED FROM YOU (one number)
Your Meta ad account ID. It's the number at the top of Ads Manager, next to the account name — usually 15 or 16 digits. If you're not sure, open adsmanager.facebook.com and it's in the top-left, or send me a screenshot and I'll find it.

If you've never run ads before and don't have an ad account yet, just tell me — we'll handle that differently and you can skip the rest of this.

THEN JUST APPROVE
Once I have that number I'll send access requests directly to your business. You'll get a notification for each one — your Facebook Page, your Instagram account, and the ad account — and each has an Approve button. That's it. No settings to dig through, no permissions to choose. I've already specified exactly what we need, so you can't accidentally send the wrong thing.

The requests will come from ejretreats (business ID ${id}). If you see anything from a different name, don't approve it and tell me.

WHERE THE APPROVALS SHOW UP
Usually as a Facebook notification and an email to whoever owns the business account. If nothing arrives within a day, they're also sitting at business.facebook.com under Settings → Requests. Worth checking there before assuming it didn't send — the notifications go to the account owner, which isn't always the person reading this.

WHAT HAPPENS NEXT
Once the approvals come through we take it from there: campaign structure, audiences, creative, budgets and ongoing management. Nothing goes live and nothing spends without you knowing.

IF YOU'D RATHER DO IT THE OTHER WAY
Some people prefer to grant it themselves. That works too: business.facebook.com → Settings → Partners → Add → "Give a partner access to your assets" → enter ${id}, then share your ad account, Facebook Page and Instagram account, giving full control on each. The catch is that it's easy to miss one or pick the wrong permission level, which is why I'd rather send the requests.

Reply here or text me if anything looks off. Happy to jump on a five-minute call and do it together.`
}
