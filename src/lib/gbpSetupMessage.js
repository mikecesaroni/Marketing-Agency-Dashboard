// The message asking a client for access to their Google Business Profile.
//
// GBP grants access to a person by email, which is what the Manager role is.
// That is enough to do the optimisation work today, and it is the only route
// available until an agency Organization account exists — Google requires one
// of those before the APIs will return anything, and a user account that
// already directly manages locations cannot be added to its user groups.
//
// So this asks for what works now, and docs/agency-access.md records that these
// grants will have to move to a location group later.

export const MANAGER_EMAIL_PLACEHOLDER = '[OUR EMAIL]'

export function buildGbpSetupMessage(email) {
  const address = String(email || '').trim() || MANAGER_EMAIL_PLACEHOLDER

  return `Quick setup so we can optimize your Google Business Profile:

Your Business Profile is what shows up in Google Maps and in the local results next to the map. It is usually the cheapest lead source a home services business has, and most profiles are half filled in. We can fix that, but Google only lets the profile owner grant access.

It takes about a minute.

1. Go to business.google.com and sign in with the Google account that owns the profile.
2. If you manage more than one location, pick the right one first.
3. Open the menu and choose Settings, then People and access. On some accounts this is called Managers.
4. Click Add, then enter our email: ${address}
5. Choose the Manager role, then click Invite.

Please pick Manager, not Owner and not Site manager. Manager lets us edit the profile, post updates and reply to reviews. Owner would hand us control of the listing, which we do not want and you should not give to any agency. Site manager cannot edit the things that actually move rankings.

WHAT WE DO ONCE WE ARE IN
- Fix the categories, which is the single biggest ranking factor most profiles get wrong
- Fill in services and service areas properly
- Add real photos and keep them coming
- Write the business description around what you actually want to sell
- Post updates and offers so the profile looks alive
- Reply to reviews, which affects both ranking and whether people call

You will get an email from Google asking you to confirm the invite. Once you accept it we take it from there and let you know when the first round is done.

Reply here or text me if you cannot find the setting. Happy to jump on a quick call and walk through it.`
}
