// The message sent to a client to get us access to their Meta assets.
//
// It asks for PARTNER access using our business portfolio ID, not access for a
// person by email. The difference decides whether this works:
//
//   Invite a person by email -> the access attaches to that individual's
//   Facebook profile. It works while they are logged in and dies with their
//   account. A system user cannot use it, so nothing can be automated.
//
//   Add a partner by business ID -> the access attaches to the agency's
//   business portfolio. Anyone on the team can be granted it, a system user
//   token can reach it, and it survives one person losing their login.
//
// The email route is kept as a fallback because some clients cannot find the
// partner screen, but it is deliberately second.

export const BUSINESS_ID_PLACEHOLDER = '[YOUR BUSINESS PORTFOLIO ID]'

export function buildMetaSetupMessage(businessId) {
  const id = String(businessId || '').trim() || BUSINESS_ID_PLACEHOLDER

  return `Quick setup on your end so we can get your Meta ads running:

We need access to your Meta business assets before we can build or manage anything. Meta requires the business owner to grant this directly, so we can't do it for you. It takes about two minutes.

Please add us as a PARTNER, not as a person. Partner access is what lets our whole team and our tools manage the account properly. Adding an individual by email only works while that one person is logged in.

1. Go to business.facebook.com and make sure your business is selected.
2. Click Settings (bottom-left), then open Partners.
3. Click Add, then "Give a partner access to your assets".
4. Enter our business portfolio ID: ${id}
5. On the next screen, choose the assets to share and give Full control on each:
   - Ad account
   - Facebook Page
   - Instagram account
   - Pixel / Dataset, if you have one
6. Click Save changes.

That's it. The invitation reaches us automatically, there is nothing to email.

IF YOU CANNOT FIND THE PARTNERS SCREEN
Some accounts hide it. In that case: Settings > People > Invite people, enter ejretreats1@gmail.com, give Full control, and assign the same assets. Tell us if you had to do it this way, because we will need to move it to partner access later.

WHAT HAPPENS NEXT
Once access comes through we handle the rest: campaign structure, audiences, creative, budgets and ongoing management. We'll take it from there and keep you posted.

Reply here or text me if you hit any snags on Meta's end. Happy to jump on a quick call if it's easier.`
}
