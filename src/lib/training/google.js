// The Google course: Search ads and pay per lead (Local Services Ads).
//
// Written from what the CRM already knows and enforces: docs/google-ads.md,
// googleSearchRules.js (the keyword and search-term verdicts), keywordPlan.js
// (how a Search account is laid out), lsaReport.js and lsaSetupMessage.js
// (pay per lead), and clientStatus.js (the leads standard).
//
// THE MOVE. Google is retiring the separate Local Services dashboard and
// moving each account's campaign into Google Ads, account by account, through
// 2027. The `lsa-move` module is the one that tracks it. What it says about
// Google's side (dates, budgets, bidding, disputes) comes from Google's help
// page "Local Services Ads transition to Performance Max campaigns with
// pay-per-lead goals" and trade reporting, as read on 21 November 2026, not
// from an account we have watched move. When a client's account moves and we
// learn how it really behaves, correct that module and bump its `version`:
// everybody who finished it then sees "Updated" and reads it again. The
// `lsa` module's sign-up steps need the same treatment the day Google lets a
// pay-per-lead campaign be created inside Google Ads.
//
// Screen names in “curly quotes” are the labels as they appear in the CRM or
// in Google.

export const GOOGLE_QUIZ = {
  id: 'google-v1',
  title: 'Google: the quiz',
  passMark: 18,
  passed: 'Passed. You know how we run Google. Next is doing it with somebody watching.',
  questions: [
    {
      id: 'ppl-billing',
      module: 'two-products',
      q: 'How does Google charge for Local Services Ads?',
      options: ['Per click', 'Per lead: a call, a message or a booking', 'A flat monthly fee', 'Per thousand views'],
      answer: 1,
      why: 'Pay per lead. That is why the CRM calls it “Pay per lead”, and why it is judged on cost per charged lead.',
    },
    {
      id: 'admin',
      module: 'two-products',
      q: 'What access do we ask a client for on their Google Ads account?',
      options: ['Read only', 'Standard', 'Admin', 'Billing only'],
      answer: 2,
      why: 'Always Admin. Google only warns admins when something breaks, and after the Local Services move the notice goes to admins too.',
    },
    {
      id: 'no-account',
      module: 'two-products',
      q: 'A new client has no Google Ads account. What happens?',
      options: [
        'We create it from our manager account with their email as the owner',
        'They create one at ads.google.com and send us the login',
        'We run their ads from our own account',
        'We skip Google for them',
      ],
      answer: 0,
      why: 'ads.google.com walks a new person straight into building a campaign and spending. We create the account so that never happens.',
    },
    {
      id: 'customer-id',
      module: 'two-products',
      q: 'Where does the client’s Google Ads customer ID come from?',
      options: ['We ask the client for it', 'From their invoice', 'From their website', 'We read it off our manager account once they have added us'],
      answer: 3,
      why: 'Never ask the client. A wrong ID puts one client’s spend on another client’s report.',
    },
    {
      id: 'verification',
      module: 'lsa',
      q: 'Who does the Local Services verification?',
      options: [
        'We do, with their documents',
        'The client, with their own Google account',
        'Google does it automatically',
        'Whoever has the license handy',
      ],
      answer: 1,
      why: 'The client verifies themselves, then adds us as Admin. We never collect a license, insurance or ID.',
    },
    {
      id: 'verification-time',
      module: 'lsa',
      q: 'How long does Google usually take to verify a business?',
      options: ['The same day', '2 to 3 days', '3 to 4 weeks', '6 months'],
      answer: 2,
      why: 'Usually 3 to 4 weeks. Tell the client that on day one so nobody is surprised.',
    },
    {
      id: 'name-match',
      module: 'lsa',
      q: 'What holds up most verifications?',
      options: [
        'The business name on the license and insurance not matching exactly',
        'The budget being too low',
        'Not enough reviews',
        'The website being slow',
      ],
      answer: 0,
      why: 'The name has to match exactly across the license, the insurance and the profile.',
    },
    {
      id: 'lsa-judged',
      module: 'lsa',
      q: 'Which number is pay per lead judged on?',
      options: ['Clicks', 'Impressions', 'Cost per click', 'Cost per charged lead'],
      answer: 3,
      why: 'Google credits back junk leads, so the leads it actually charged for are the ones that count.',
    },
    {
      id: 'disappeared',
      module: 'lsa-move',
      q: 'A client says their Local Services Ads have disappeared. What is the first thing to check?',
      options: [
        'Whether their license expired',
        'Their Google Ads account, for a pay-per-lead campaign',
        'Their Google Business Profile reviews',
        'Whether Google banned them',
      ],
      answer: 1,
      why: 'Usually it has only moved into Google Ads, as a Performance Max campaign with a pay-per-lead goal.',
    },
    {
      id: 'penny-budget',
      module: 'lsa-move',
      q: 'The CRM says a pay-per-lead campaign’s “budget is $0.01 in Google”. What does that mean?',
      options: [
        'It is spending one cent a day',
        'Google is giving the client free leads',
        'It is a placeholder, the campaign cannot spend, and it needs a real budget set',
        'The sync is broken',
      ],
      answer: 2,
      why: 'Google leaves $0.01 as a placeholder and that alone stops it spending. Set a real budget in Google Ads.',
    },
    {
      id: 'weekly-budget',
      module: 'lsa-move',
      q: 'When an account moves into Google Ads, what does Google do with the old weekly budget?',
      options: [
        'Divides it by 7 to make a daily average',
        'Keeps it weekly',
        'Resets it to zero',
        'Doubles it',
      ],
      answer: 0,
      why: 'Weekly divided by 7. Write the weekly number down before the move so you can check the daily one after it.',
    },
    {
      id: 'before-move',
      module: 'lsa-move',
      q: 'What do we save before a client’s account moves?',
      options: [
        'Nothing. It all carries over',
        'Their password',
        'Their photos',
        'The old dashboard’s reports, the weekly budget and the cost per lead',
      ],
      answer: 3,
      why: 'Old performance reports do not come across. Once the account moves, the old dashboard is gone.',
    },
    {
      id: 'new-ppl',
      module: 'lsa-move',
      q: 'A brand new client wants pay per lead. Where does sign-up start today?',
      options: [
        'Inside Google Ads, as a new campaign',
        'At g.co/localservices, the same as before',
        'In the CRM',
        'On their Google Business Profile',
      ],
      answer: 1,
      why: 'A pay-per-lead campaign cannot be created from scratch inside Google Ads yet. This is the step most likely to change.',
    },
    {
      id: 'structure',
      module: 'search',
      q: 'How do we lay out a Search account?',
      options: [
        'One campaign with every keyword in it',
        'One campaign per ZIP code',
        'Campaigns by intent, ad groups by service',
        'One campaign per day of the week',
      ],
      answer: 2,
      why: 'Emergency and repair first, then installs, core services, maintenance, and brand. Each ad group is one service with 3 to 15 keywords.',
    },
    {
      id: 'winner',
      module: 'search',
      q: 'A keyword has one conversion. Is it a “Winner”?',
      options: ['No. A winner needs three', 'Yes', 'Only if it cost under $50', 'Only on exact match'],
      answer: 0,
      why: 'One conversion is noise. Three is a pattern.',
    },
    {
      id: 'not-converting',
      module: 'search',
      q: 'When does the CRM call a keyword “Not converting”?',
      options: [
        'After one day with no leads',
        'When its click-through rate is under 2%',
        'When it is on phrase match',
        'No conversions after $75 of spend, or after 20 clicks',
      ],
      answer: 3,
      why: 'Either one. Twenty clicks with no calls is a keyword that attracts people who are not buying, whatever it cost.',
    },
    {
      id: 'negative',
      module: 'search',
      q: 'The search term “hvac technician jobs near me” has spent $8. What do you do?',
      options: ['Leave it, it is cheap', 'Add it as a negative in Google Ads', 'Raise the bid', 'Pause the whole ad group'],
      answer: 1,
      why: 'Job hunters are never customers. A negative saves that spend across every campaign at once.',
    },
    {
      id: 'crm-writes',
      module: 'search',
      q: 'You want to pause a keyword the CRM flagged. Where do you do it?',
      options: ['In the CRM, on the keyword row', 'In the weekly report', 'In Google Ads. The CRM never changes anything in Google', 'Ask the client to'],
      answer: 2,
      why: 'The CRM reads Google and tells you what to act on. Every change is made in Google Ads.',
    },
    {
      id: 'two-totals',
      module: 'numbers',
      q: 'The Google Ads report total does not match “Search ads” on Live KPIs. Why?',
      options: [
        'The report’s total includes pay per lead, and “Search ads” leaves it out',
        'One of them is broken',
        'The report is a day behind',
        'Live KPIs adds Meta in',
      ],
      answer: 0,
      why: 'Same account, two readings. “Search ads” on Live KPIs is every campaign except Local Services.',
    },
    {
      id: 'no-access',
      module: 'numbers',
      q: 'A client shows “No access yet” on the Google Ads report. What does that tell you?',
      options: [
        'They have not spent anything',
        'Their ads are paused',
        'Their card failed',
        'We have an ID saved but they have not let us in',
      ],
      answer: 3,
      why: 'A saved ID is not access. Send the step-by-step message, then accept the invitation when it arrives.',
    },
  ],
}

export const GOOGLE_COURSE = {
  id: 'google',
  title: 'Google',
  blurb: 'Search ads and pay per lead (Local Services Ads): getting access, getting a client verified, what changes as Local Services moves into Google Ads, and cutting wasted spend.',
  tone: 'from-emerald-600 to-teal-400',
  quiz: GOOGLE_QUIZ,
  modules: [
    {
      id: 'two-products',
      title: 'Two products, one login',
      minutes: 5,
      version: 1,
      updated: '2026-11-21',
      cards: [
        {
          type: 'read',
          title: 'Two ways to buy leads on Google',
          points: [
            'Search ads: we choose keywords, the ad shows when somebody searches them, and the client pays when it is clicked.',
            'Pay per lead, which Google calls Local Services Ads: the “Google Verified” ads at the very top. Google bills per lead, not per click. A lead is a call, a message or a booking.',
          ],
          body: ['The CRM calls them “Google Search” and “Google pay per lead”. The “Meta and Google” package includes both. One Google Ads login covers both.'],
        },
        {
          type: 'read',
          title: 'Getting in',
          body: ['The access message is ready to copy in the CRM, in a short version and a step-by-step one. It walks the client through two things, in this order.'],
          points: [
            'In Google Ads, under access and security: add our domain as an allowed domain and save.',
            'Then on Users: the blue + button, our email, “Admin” access, “Send invitation”.',
            'We accept the invitation, read their customer ID off our manager account, paste it on the client’s page under Google Search, and press “Save & sync”. It pulls 30 days and says whether it worked.',
          ],
        },
        {
          type: 'read',
          tone: 'standard',
          title: 'Three rules about access',
          points: [
            'Always ask for Admin. Google only warns admins when something breaks.',
            'Never ask the client for their customer ID. We read it off our manager account. A wrong ID puts one client’s spend on another’s report.',
            'No Google Ads account yet? The client does not create one. We create it from our manager account with their email as the owner.',
          ],
        },
        {
          type: 'check',
          q: 'A new client says “I’ll just go to ads.google.com and make an account.” What do you say?',
          options: ['Great, send us the login', 'Please do not. We will create it for you with your email as the owner', 'Use your personal Gmail'],
          answer: 1,
          why: 'ads.google.com walks a new person straight into building a campaign and entering a card. We create it so that does not happen.',
        },
        {
          type: 'read',
          title: 'Connected is not the same as running',
          points: [
            '“No ID yet”: nothing saved for this client.',
            '“No access yet”: an ID is saved, but they have not let us in.',
            '“Connected, no spend”: we are in, and nothing spent in the range you are looking at.',
            '“Live”: spending.',
          ],
        },
        {
          type: 'check',
          q: 'A client shows “Connected, no spend”. What is true?',
          options: ['We have access and nothing has spent in this range', 'They have not accepted our invitation', 'Their account is banned'],
          answer: 0,
          why: 'Access is fine. The question now is why nothing is spending: no campaign yet, a paused one, or no budget.',
        },
      ],
    },
    {
      id: 'lsa',
      title: 'Pay per lead: getting a client live',
      minutes: 6,
      version: 1,
      updated: '2026-11-21',
      note: 'sign-up steps may change as Google moves Local Services into Google Ads',
      cards: [
        {
          type: 'read',
          title: 'Why it is worth the wait',
          body: [
            'These are the ads above everything else on Google, with the “Google Verified” badge. The client pays only when somebody calls, messages or books, and Google credits back junk.',
            'The catch is verification. Google checks the business before a single ad runs.',
          ],
        },
        {
          type: 'read',
          tone: 'standard',
          title: 'The client verifies. We do not.',
          body: [
            'The client signs up and gets verified themselves, with their own Google account, at g.co/localservices. Then they add us as Admin.',
            'We never collect their license, insurance or ID, and we never start the account for them. Those are their documents and their name.',
          ],
        },
        {
          type: 'read',
          title: 'What Google asks them for',
          points: [
            'A business check: registration and ID.',
            'A background check for each owner. No credit check. In some trades, each technician too.',
            'Their license or licenses.',
            'Their insurance.',
          ],
          body: [
            'It usually takes Google 3 to 4 weeks. The business name on the license and the insurance has to match exactly. That is what holds most people up, so say it on day one.',
          ],
        },
        {
          type: 'check',
          q: 'A client says “Can you just upload my license and insurance for me?”',
          options: ['Yes, email them over', 'Yes, if they send their Google password', 'No. They upload them from their own Google account, and we take over once they are verified'],
          answer: 2,
          why: 'We never hold a client’s license, insurance or ID. Send them the setup message instead. It walks them through it.',
        },
        {
          type: 'read',
          title: 'The setup message',
          body: ['It is ready to copy on the pay per lead report, under “Connecting a client’s pay per lead”. It gives the client two steps.'],
          points: [
            'Step 1: sign up and get verified.',
            'Step 2: once verified, add us as an Admin. In Google Ads: “Admin”, “Access and security”, the blue + button, our email, “Admin access”, send.',
            'If they are still on the old Local Services dashboard: “Account Access”, the blue + button, the same email as Admin.',
            'If Google shows an error, they add our domain as an allowed domain and send it again.',
          ],
        },
        {
          type: 'read',
          title: 'After they are in',
          body: ['From there it is ours: budget, service areas, job types, photos and the day to day.'],
          points: [
            'The pay per lead report shows Spend, Leads, Charged leads, Cost per charged lead and Booked.',
            'Each lead is a Call, a Message or a Booking, and is marked “Charged”, “Credited back” or “Not charged”.',
            'Cost per charged lead is the number pay per lead is judged on.',
            'A client who is not connected yet has their week logged by hand with “Log KPIs”.',
          ],
        },
        {
          type: 'do',
          title: 'Find the setup message',
          body: ['Open the pay per lead report.'],
          to: '/reports/lsa',
          label: 'Open Google pay per lead',
          look: ['“Connecting a client’s pay per lead”, and the message to copy', 'A client marked “Live” and one that is not, and what the row says about why'],
        },
        {
          type: 'check',
          q: 'Which number tells you whether a client’s pay per lead is working?',
          options: ['Cost per charged lead', 'Impressions', 'Total leads, charged or not'],
          answer: 0,
          why: 'Leads Google credited back cost nothing, so they do not count. What matters is what each charged lead cost.',
        },
      ],
    },
    {
      id: 'lsa-move',
      title: 'Local Services is moving into Google Ads',
      minutes: 7,
      version: 1,
      updated: '2026-11-21',
      note: 'kept current as Google rolls it out',
      cards: [
        {
          type: 'read',
          title: 'What is happening',
          body: [
            'Google is retiring the separate Local Services dashboard. Each account’s campaign is being moved into Google Ads, where it becomes a Performance Max campaign with a pay-per-lead goal.',
            'It goes account by account. It started in August 2026 with home and storefront services in the US and runs through 2027. There is no single date: one client can be moved while another is still on the old dashboard.',
          ],
          points: ['This module is as of 21 November 2026. When Google changes something, it is updated and you will see “Updated” on it.'],
        },
        {
          type: 'read',
          title: 'What stays the same, and what changes',
          points: [
            'Same: the ads still show in the Local Services spots at the top. The client still pays per lead, not per click. Verification still applies.',
            'Changes: it is managed in Google Ads, as a campaign.',
            'Changes: the weekly budget becomes a daily average. Google divides the old weekly budget by 7.',
            'Changes: you can no longer set your own maximum cost per lead. Google bids automatically.',
            'Changes: leads are read inside Google Ads, not in the old inbox.',
            'Changes: the old dashboard’s reports do not come across.',
          ],
        },
        {
          type: 'read',
          tone: 'warning',
          title: 'Lead disputes',
          body: [
            'Google’s help page says manual lead disputes are not supported after the move. Google decides what to credit back by itself. Some guides say otherwise.',
            'So do not promise a client that we will dispute a lead. Look at how their own account behaves first, and tell the GHL or Google lead what you find so this page gets corrected.',
          ],
        },
        {
          type: 'read',
          tone: 'standard',
          title: 'Before a client’s account moves',
          body: ['Google emails the account’s admins before it moves an account, reported as two weeks ahead with a reminder a week out. That is one more reason we are always Admin.'],
          points: [
            'Save the old dashboard’s reports. Export them, or screenshot them. After the move they are gone.',
            'Write down the weekly budget and the cost per lead, so you can check the new daily budget and spot a change.',
            'Confirm we are Admin on their Google Ads account, not only on the old dashboard.',
            'Tell the client it is coming, so “my ads disappeared” is not the first we hear of it.',
          ],
        },
        {
          type: 'check',
          q: 'A client calls: “My Local Services Ads are gone, I can’t log in to the dashboard.” What do you check first?',
          options: ['Whether Google suspended them', 'Their Google Ads account, for a pay-per-lead campaign', 'Whether their insurance lapsed'],
          answer: 1,
          why: 'A client who says their Local Services Ads disappeared has usually only seen them move into Google Ads.',
        },
        {
          type: 'read',
          title: 'How the CRM handles both',
          body: ['The CRM calls it “Pay per lead” whichever side of the move a client is on, and reads both.'],
          points: [
            'After the move, the campaign is named like “Pay-per-lead-PMax-” and the business, or “LocalServicesCampaign:SystemGenerated:” and a number. The CRM spots it by that name.',
            'A client counts as connected as soon as the campaign exists, before it has spent anything.',
            'Being added to their Google Ads account is enough. No extra link is needed.',
          ],
        },
        {
          type: 'read',
          tone: 'warning',
          title: 'Three things to look for after a move',
          points: [
            '“budget is $0.01 in Google: set a real budget”. Google leaves one cent as a placeholder, and that alone stops the campaign spending.',
            '“campaign paused in Google”. Somebody, or the move, paused it.',
            '“campaign on, nothing spent: check verification and budget”. On only means nobody paused it. It does not mean it is serving.',
          ],
          body: ['The CRM marks a client “Stopped” when pay per lead spent before and every campaign is now paused or removed, or nothing has spent for 7 days.'],
        },
        {
          type: 'check',
          q: 'A campaign is on, and the CRM says its budget is $0.01. What do you do?',
          options: ['Nothing, it is cheap', 'Pause it', 'Set a real daily budget in Google Ads'],
          answer: 2,
          why: 'One cent is a placeholder. Take the weekly budget you wrote down before the move, divide by 7, and set that.',
        },
        {
          type: 'read',
          title: 'New clients, for now',
          body: [
            'A pay-per-lead campaign cannot be created from scratch inside Google Ads yet. A brand new client still signs up and verifies at g.co/localservices, exactly as in the last module.',
            'This is the step most likely to change next. When Google allows it inside Google Ads, the last module and this one are rewritten.',
          ],
        },
      ],
    },
    {
      id: 'search',
      title: 'Search campaigns, our way',
      minutes: 8,
      version: 1,
      updated: '2026-11-21',
      cards: [
        {
          type: 'read',
          title: 'Start from the keyword plan',
          points: [
            'Open “Keyword plan” from the client’s Google Ads page.',
            'Check the seed services, the places (up to 10) and the “Average job value”, then press “Build the plan”. It takes about ten seconds.',
            'Untick a keyword to drop it. Click a match type to flip it.',
            'Export with “Copy for Ads Editor”, “Download CSV” or “Copy as text”, then build the campaign in Google Ads.',
          ],
          body: ['The CRM never changes anything in Google. It reads, and tells you what to act on. Every change is made in Google Ads.'],
        },
        {
          type: 'read',
          title: 'How an account is laid out',
          body: ['Campaigns by what the searcher wants, in this order. The first ones get the money first.'],
          points: [
            'Emergency & Repair',
            'Installation & Replacement',
            'Core Services',
            'Maintenance & Tune-ups',
            'Brand',
          ],
        },
        {
          type: 'read',
          title: 'Ad groups, match types and what a keyword can afford',
          points: [
            'One ad group per service, with 3 to 15 keywords.',
            'Exact match when a keyword is searched 500 or more times a month and the intent is emergency, repair, install or “looking for a company”. Phrase match everywhere else.',
            'Each keyword is marked “Pays”, “Tight” or “Too pricey”: a lead may cost up to 20% of what the job is worth.',
            'Keywords marked “Do not bid” stay out.',
          ],
        },
        {
          type: 'read',
          tone: 'standard',
          title: 'Negatives are where the money is',
          body: [
            'One negative keyword saves that spend across every campaign at once. Every plan ships with a negative list, and it grows every week from the search terms.',
          ],
          points: ['Never a customer: people looking for jobs, training, how to do it themselves, parts or equipment to buy, and anything “free” or “cheapest”.'],
        },
        {
          type: 'check',
          q: 'The search term “how to fix a leaking water heater yourself” has clicks. What do you do?',
          options: ['Add it as a negative in Google Ads', 'Write an ad for it', 'Leave it, the clicks are cheap'],
          answer: 0,
          why: 'Somebody doing it themselves is not hiring anybody. The CRM marks terms like this “Block this”.',
        },
        {
          type: 'read',
          title: 'The labels on a keyword',
          points: [
            '“Too early”: under $20 spent. It has not had a fair run.',
            '“Not converting”: no conversions after $75 of spend, or after 20 clicks. Pause it.',
            '“Too expensive”: it converts, at over $200 each. That line is generous on purpose: killing a keyword that books installs is the worse mistake.',
            '“Winner”: three or more conversions. Give it room.',
            '“OK”: leave it.',
          ],
        },
        {
          type: 'read',
          title: 'The labels on a search term',
          points: [
            '“Block this”: plainly never a customer. Add the negative.',
            '“Consider blocking”: it has spent $25 or more with nothing back. A person decides whether it is really a bad fit.',
            '“Added” and “Excluded”: already dealt with.',
          ],
          body: ['Do not add keyword dollars to search-term dollars. They are the same spend seen two ways, and Google hides some terms, so they never add up.'],
        },
        {
          type: 'do',
          title: 'See what there is to act on',
          body: ['Open the Google Ads report.'],
          to: '/reports/google-search',
          label: 'Open the Google Ads report',
          look: ['“Block these searches”', '“Keywords to act on”', 'Each client’s status: “Live”, “No access yet”, “Connected, no spend” or “No ID yet”'],
        },
        {
          type: 'check',
          q: 'A keyword has spent $90 with one conversion. Which label does it get?',
          options: ['“Not converting”', '“OK”', '“Winner”'],
          answer: 1,
          why: 'It has converted, at $90, which is under the $200 line. And one conversion is not three. So it is “OK”: leave it and keep watching.',
        },
      ],
    },
    {
      id: 'numbers',
      title: 'Reading the Google numbers and acting',
      minutes: 5,
      version: 1,
      updated: '2026-11-21',
      cards: [
        {
          type: 'read',
          tone: 'standard',
          title: 'The same standard: 5 to 7 leads a week',
          body: ['Every channel counts toward it. The flags are the same ones Meta raises.'],
          points: [
            'Amber, “Only N leads this week (standard is 5 to 7)”: fewer than five leads on a full week of spend.',
            'Red, “No leads for N days”: ads ran and nothing came back for a week.',
            'Amber, “Google Ads sync failing”: we have lost access or something broke. It waits for the morning brief.',
            'Ads that started inside 14 days are marked as still learning. A first week of spend is “New”, not “Down”.',
          ],
        },
        {
          type: 'read',
          title: 'Where to read it',
          points: [
            'Live KPIs has one “Google Ads” card: Spend, Leads and Cost per lead, then “Search ads” and “Pay per lead” underneath, with “Charged” and “Per charged lead”.',
            'The Google Ads report is where keywords and search terms are.',
            'The pay per lead report is where each lead is.',
            'The morning brief, 7am Eastern, has a “Google pay per lead (LSA), last 7 days” section: leads, charged, spend and cost per charged lead for each business.',
          ],
        },
        {
          type: 'read',
          tone: 'warning',
          title: 'Two totals that will not match',
          body: [
            'The Google Ads report’s total includes pay per lead. “Search ads” on Live KPIs is every campaign except Local Services. Same account, two readings. Neither is wrong.',
          ],
        },
        {
          type: 'check',
          q: 'A client’s Google campaign started four days ago and has two leads. Is that a problem?',
          options: ['Yes, flag it to the client', 'Yes, pause it', 'Not yet. It is still learning, and a first week is “New”'],
          answer: 2,
          why: 'Do not flag a campaign that is a few days old. Judge it on a full week or two.',
        },
        {
          type: 'read',
          title: 'What to do for each flag',
          points: [
            '“No access yet”: send the step-by-step access message, then accept the invitation.',
            '“Not converting” on a keyword: pause it in Google Ads.',
            '“Block this” on a search term: add the negative.',
            'A $0.01 budget on pay per lead: set a real one.',
            '“Marked live, not connected”: send the pay per lead setup message.',
            'Low leads and nothing flagged: look at the ads, the offer and the form.',
          ],
        },
        {
          type: 'do',
          title: 'Read the Google card',
          body: ['Open Live KPIs and find the Google Ads card.'],
          to: '/reports',
          label: 'Open Live KPIs',
          look: ['“Search ads” and “Pay per lead” on the same card', 'Any line that says a campaign is set up and not spending, and why'],
        },
        {
          type: 'check',
          q: 'A client shows “Marked live, not connected” for pay per lead. What do you do?',
          options: ['Send them the pay per lead setup message so they add us as Admin', 'Turn the switch off', 'Create a campaign for them'],
          answer: 0,
          why: 'Somebody told us it is live, but we cannot see it. Once they add us, the CRM reads it by itself.',
        },
      ],
    },
  ],
}
