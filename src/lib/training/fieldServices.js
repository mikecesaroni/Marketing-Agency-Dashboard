// The Field Services course: HighLevel's job software, and how we roll it
// out to a client.
//
// Field Services is a beta. Everything here about how it behaves was written
// from HighLevel's help pages before anybody on the team had used it, and the
// rollout rules are the ones in the Field Services Rollout Plan. Once it has
// been run on our own account, correct what turned out different and bump
// that module's `version` so everybody who finished it reads it again.
//
// The quiz is the 20 questions in src/lib/fieldServicesQuiz.js: level 1 of
// the four a team member clears before running a client onboarding alone.
// Each question there names a study section; STUDY_TO_MODULE says which
// module of this course covers it, so a failed attempt links straight back.

import { FIELD_SERVICES_QUIZ } from '../fieldServicesQuiz.js'

const STUDY_TO_MODULE = {
  'Turning it on': 'start',
  'The setup order': 'build',
  'Service areas': 'build',
  'Services and add-ons': 'build',
  Home: 'day',
  'Requests and the booking page': 'day',
  'Jobs and visits': 'day',
  'Schedule, dispatch and routes': 'day',
  'The technician app': 'field',
  'Invoices and payments': 'field',
  'Customer and team messages': 'field',
  'Our rules': 'rollout',
}

export const FIELD_SERVICES_COURSE = {
  id: 'field-services',
  title: 'Field Services',
  blurb: 'HighLevel’s job software for service businesses: turning it on, building a client in order, running a day on it, and taking a client live.',
  tone: 'from-slate-800 to-slate-600',
  quiz: {
    ...FIELD_SERVICES_QUIZ,
    passed: 'Passed. That is level 1. Level 2 is next: build the sandbox from the SOP alone.',
    note: 'This is level 1 of 4. After it: build the sandbox from the SOP alone, sit in on one whole client, then run one with the GHL lead watching. Passing the quiz does not clear anybody to touch a client account.',
    questions: FIELD_SERVICES_QUIZ.questions.map((q) => ({ ...q, module: STUDY_TO_MODULE[q.study] })),
  },
  modules: [
    {
      id: 'start',
      title: 'What it is, and turning it on',
      minutes: 5,
      version: 1,
      updated: '2026-11-21',
      cards: [
        {
          type: 'read',
          title: 'What Field Services is',
          body: [
            'It is job software built into the client’s HighLevel account: requests, estimates, jobs, a schedule, an app for the technicians, and invoices. The same kind of tool as Housecall Pro or Jobber, inside the system we already run for them.',
            'It matters to us because it puts a client’s office and technicians in our system every working day, not just when a lead comes in.',
          ],
        },
        {
          type: 'read',
          tone: 'warning',
          title: 'It is a beta',
          body: [
            'HighLevel says screens and features may change. This course was written from HighLevel’s help pages before our team had used it.',
            'If what you see does not match what you read here, tell the GHL lead the same day. That is how the course, the SOP and the quiz get fixed.',
          ],
        },
        {
          type: 'read',
          title: 'Turning it on',
          points: [
            'Where: Agency view, Sub-accounts, Features and Limits, Industry.',
            'A new account: Create Sub-Account, “Start from an industry”, Field services.',
            'An existing account: Features and Limits, Industry, “Set Industry”. It only works while the account shows “No industry”.',
            'Once it is on, Field Services appears in the left menu with a Beta tag.',
            'Calendars, services and workflows already in the account are left alone.',
          ],
        },
        {
          type: 'read',
          tone: 'warning',
          title: 'One industry, and no undo',
          body: ['An account gets one industry. It cannot be changed or removed later without HighLevel support. Check you are in the right account twice before you click.'],
        },
        {
          type: 'check',
          q: 'You set the industry on the wrong client’s account. Can you switch it back?',
          options: ['Yes, from Features and Limits', 'No. Only HighLevel support can change or remove it', 'Yes, within 24 hours'],
          answer: 1,
          why: 'One industry per account and no undo. That is why we check the account twice.',
        },
        {
          type: 'read',
          tone: 'standard',
          title: 'Where you practice, and the four levels',
          body: ['Practice happens on the sandbox account and nowhere else. HighLevel has no test copy of a live account, so nobody learns on a client.'],
          points: [
            'Level 1, Learn: this course and its quiz.',
            'Level 2, Build: set up the sandbox from the SOP alone, with nobody helping.',
            'Level 3, Shadow: sit in on one whole client, from kickoff to cutover.',
            'Level 4, Lead: run one onboarding while the GHL lead watches and scores.',
          ],
        },
        {
          type: 'check',
          q: 'You passed the quiz. Can you start building in a client’s account?',
          options: ['Yes', 'Yes, if the client is small', 'No. The quiz is level 1 of 4, and practice is on the sandbox'],
          answer: 2,
          why: 'Passing the quiz does not clear anybody to touch a client account. Levels 2 to 4 do.',
        },
      ],
    },
    {
      id: 'build',
      title: 'Building a client, in order',
      minutes: 7,
      version: 1,
      updated: '2026-11-21',
      cards: [
        {
          type: 'read',
          title: 'The ten steps',
          body: ['Every client is built in this order. Each step leans on the one before it.'],
          points: [
            '1. Service areas, and the rule for bookings outside them',
            '2. Staff: hours, areas, route start and end, visit limits',
            '3. Services and add-ons with prices',
            '4. Settings: online booking and payments, and connect Stripe',
            '5. The booking page',
            '6. Notifications',
            '7. Checklists and Timesheets, if the client wants them',
            '8. One test job end to end, from request to paid',
            '9. The mobile app on every technician’s phone',
            '10. Go live',
          ],
        },
        {
          type: 'read',
          title: 'Why by hand',
          body: [
            'HighLevel has no way yet to copy a finished Field Services setup to another account. Snapshots for it are listed as upcoming. Until then this order is the SOP, and every client is built from it by hand.',
          ],
        },
        {
          type: 'read',
          title: 'Step 1: service areas',
          points: [
            'Where: Field Services, Services & staff, Service areas.',
            'Coverage is a radius or a list of ZIP codes. We use a ZIP list, and the same ZIPs we target the client’s ads to, so a lead we paid for is always inside the area.',
            'An optional travel fee is charged once per job.',
            'Bookings from outside the area can be blocked, or allowed with a review flag. We allow them with the flag, so a person decides. We never block a paying customer silently.',
          ],
        },
        {
          type: 'check',
          q: 'A customer one town outside the service area tries to book. What should our setup do?',
          options: ['Let it through flagged for review', 'Block it', 'Let it through with no flag'],
          answer: 0,
          why: 'The office decides, not the software. “Assign flagged bookings to” sets who gets them.',
        },
        {
          type: 'read',
          title: 'Step 2: staff',
          body: ['Staff are users of the client’s HighLevel account. Every technician has their own login. Logins are never shared.'],
          points: [
            'Where: Field Services, Services & staff, Staff.',
            'Per person: working hours and time off, the services they can do, the areas they cover, where their route starts and ends, and visit limits per day, week and month.',
            'Owners, office staff and dispatchers can use Field Services without being assigned visits.',
          ],
        },
        {
          type: 'read',
          title: 'Step 3: services',
          points: [
            'A service is what the customer books and what goes on the estimate and the invoice. Every visit needs at least one.',
            'The service sets how long the visit takes and which staff can do it.',
            'Type them in, or import a CSV.',
            'On import, a service whose name already exists is skipped, not updated. To change a price, edit the service itself.',
            'Start with the client’s 20 most common jobs at flat prices, not their whole price list.',
          ],
        },
        {
          type: 'check',
          q: 'You re-import the services CSV with new prices. The names are the same. What happens?',
          options: ['The prices update', 'Every service is doubled', 'The rows are skipped. Nothing changes'],
          answer: 2,
          why: 'Existing names are skipped. Edit the service to change its price.',
        },
        {
          type: 'read',
          title: 'Steps 4 to 10',
          points: [
            'Connect and verify Stripe early. A lot depends on it, and an unverified account pauses payouts.',
            'Build the booking page, then set what the customer, the technician and the office each get told.',
            'Run one test job the whole way, from request to paid, before anybody real uses it.',
            'Get the app on every technician’s phone and watch each one log in.',
          ],
        },
      ],
    },
    {
      id: 'day',
      title: 'Running the day',
      minutes: 7,
      version: 1,
      updated: '2026-11-21',
      cards: [
        {
          type: 'read',
          tone: 'standard',
          title: 'Home, every morning',
          body: ['Home is the screen the office opens first. It has three blocks, and each one is a to-do list.'],
          points: [
            'Money: payments collected, awaiting payment, jobs awaiting invoices, estimates awaiting response.',
            'Scheduling: today’s visits, unassigned visits, the schedule.',
            'Work needing attention: jobs requiring action, jobs to schedule, requests requiring action, new requests.',
            'Our standard: “Unassigned visits” and “Requests requiring action” are at zero by 10am every day.',
          ],
        },
        {
          type: 'read',
          title: 'Requests',
          points: [
            'A request arrives three ways: the customer fills in the booking page, staff add it, or the AI receptionist takes it.',
            'The built-in AI receptionist is chat only. It does not answer the phone yet.',
            'From a request’s three-dots menu: “Convert to estimate” when a price still has to be agreed, or “Convert to job” when it already is. Convert to job skips the estimate and carries the customer and the work across.',
          ],
        },
        {
          type: 'check',
          q: 'A request comes in. The customer already agreed the price on the phone. What do you do?',
          options: ['Convert to estimate and wait', 'Convert to job', 'Delete it and make a job from scratch'],
          answer: 1,
          why: 'There is nothing left to approve, so skip the estimate. Everything already captured comes across.',
        },
        {
          type: 'read',
          title: 'Estimates',
          body: [
            'Made from “New estimate” or from a request. Lines are services and products with prices. Send it, and once the customer approves, turn it into a job.',
            'This is the least documented part of the beta. Ask the GHL lead before promising a client anything about deposits, signatures or good-better-best options.',
          ],
        },
        {
          type: 'read',
          title: 'Jobs and visits',
          points: [
            'A job is one customer at one address, with as many visits as it needs.',
            'A visit has a date, a time, a length, one or more staff, and an arrival window the customer sees.',
            'Statuses set themselves: Unscheduled, Scheduled, In progress, Action required, Ready to invoice, Closed, Cancelled. Nobody sets them by hand.',
            'A status that looks wrong means something upstream was skipped, usually a visit update on the technician’s phone.',
          ],
        },
        {
          type: 'check',
          q: 'A repair needs three trips to the same house. How is it set up?',
          options: ['Three jobs', 'One visit with three technicians', 'One job with three visits'],
          answer: 2,
          why: 'One customer, one address, one piece of work: one job. The trips are its visits.',
        },
        {
          type: 'read',
          title: 'Scheduling and routes',
          points: [
            'The schedule shows as a list, a calendar (Day, Timeline, Week or Month) and a map.',
            '“Find availability”: pick a week, a part of the day and the staff. Slots come back tagged “Best match”, the shortest drive, or “Earliest”, the soonest. The dispatcher can always override.',
            'Route optimization reorders one technician’s day and shows the drive time saved before you apply it.',
            'Lock any visit that cannot move before you optimize. A locked visit stays put and the rest is reordered around it.',
          ],
        },
        {
          type: 'check',
          q: 'You want to optimize a technician’s route. One visit has a time the customer was promised. What do you do first?',
          options: ['Lock that visit', 'Call the customer to warn them', 'Skip optimizing'],
          answer: 0,
          why: 'Locked visits do not move. Then optimize the rest.',
        },
      ],
    },
    {
      id: 'field',
      title: 'Technicians, money and messages',
      minutes: 6,
      version: 1,
      updated: '2026-11-21',
      cards: [
        {
          type: 'read',
          title: 'The technician’s app',
          points: [
            'It is the HighLevel mobile app. Inside it: Apps, Sales & Operations, Jobs.',
            'Each technician signs in with their own login.',
            'A technician can see their schedule, open a visit and change its status, work the checklist, add notes, and start and stop the timer if Timesheets is on.',
            'Field Services has to be set up on the web first, or Jobs does not appear in the app at all.',
          ],
        },
        {
          type: 'check',
          q: 'A technician opens the app and cannot find Jobs. What do you check first?',
          options: ['Their phone’s software version', 'That Field Services is set up on the web for that account', 'Their Stripe connection'],
          answer: 1,
          why: 'Jobs only shows in the app once the web side is set up. After that, check they are signed in as themselves.',
        },
        {
          type: 'read',
          title: 'Invoices and getting paid',
          points: [
            'On a job, the Billing card has “Create invoice”. It shows the total, invoiced, paid and outstanding.',
            'A job can carry several invoices, so a deposit, progress and the balance can each be billed.',
            'An invoice can be sent with no payment provider connected. Paying online needs one.',
            'Tap to Pay and cards on file work with Stripe only.',
          ],
        },
        {
          type: 'check',
          q: 'A client wants technicians to take cards on their phones. What do they need?',
          options: ['Any payment provider', 'Nothing extra', 'Stripe, connected and verified'],
          answer: 2,
          why: 'Tap to Pay and cards on file are Stripe only. That is why Stripe is done before a cutover date is set.',
        },
        {
          type: 'read',
          title: 'Messages to customers and the team',
          points: [
            'Where: Field Services Settings, Global settings, Operations, Notifications.',
            'By email, text or WhatsApp, set separately for the customer, the technician and the office.',
            'Covered: request submitted, visit scheduled, rescheduled and cancelled, reminders, technician on the way, visit completed.',
            'Not covered: a review request. We send that from a normal GoHighLevel workflow, or by hand, until HighLevel adds it.',
          ],
        },
        {
          type: 'read',
          tone: 'warning',
          title: 'What it cannot do yet',
          points: [
            'Copy a finished setup to another account',
            'Reports on jobs, visits and requests',
            'Turn one of our ad leads into a request by itself. The office does it by hand.',
            'Repeating jobs for maintenance plans are not documented',
            'Import from Housecall Pro or Jobber. Planned for after the beta.',
            'Answer the phone with its built-in AI',
          ],
          body: ['Never promise a client one of these. Say what we do meanwhile.'],
        },
        {
          type: 'check',
          q: 'A client asks how customers get asked for a review after a job. What is true?',
          options: ['We send it from a normal GoHighLevel workflow. Field Services has no review request', 'Field Services sends one when the visit is completed', 'The technician sends it from the app'],
          answer: 0,
          why: 'It is not in the Field Services notification list, so it comes from a workflow we build.',
        },
      ],
    },
    {
      id: 'rollout',
      title: 'Taking a client live',
      minutes: 6,
      version: 1,
      updated: '2026-11-21',
      cards: [
        {
          type: 'read',
          title: 'Who goes first',
          points: [
            'Five technicians or fewer, running on paper or spreadsheets, GoHighLevel already live, and an owner who likes us.',
            'Clients on Jobber or Housecall Pro move at their renewal, not in the middle of a paid term.',
            'Clients on ServiceTitan or a long contract do not move. We connect to it.',
            'Never a cutover in a client’s busy season.',
          ],
        },
        {
          type: 'read',
          title: 'The shape of an onboarding',
          points: [
            'Kickoff call: start Stripe, texting registration and logins, and go through their customer and price lists with them.',
            'Build in the ten-step order, then pass the QA scorecard before anybody at the client sees it.',
            'Train the office first. Train the technicians last, the day before go-live.',
            'Run alongside their old way for two to four weeks, then a hard cutover.',
            'A review with the owner on day 30.',
          ],
          body: ['We never import a customer or price list we have not read. History does not come across, so the old tool stays open, read-only, for looking things up.'],
        },
        {
          type: 'read',
          tone: 'standard',
          title: 'No date until three things are done',
          body: ['A cutover date is only set when all three of these are true. All three are started on the kickoff call, because each can take a week.'],
          points: ['Stripe is connected and verified', 'Texting is registered, so reminders are not filtered', 'Every technician can log in to the app'],
        },
        {
          type: 'check',
          q: 'On the kickoff call the owner asks “So we go live on the 1st?” Stripe is not verified yet. What do you say?',
          options: ['Yes, the 1st', 'We set the date once Stripe, texting and every technician’s login are done', 'Yes, and we will fix Stripe after'],
          answer: 1,
          why: 'A date promised before those three is a date missed. Until all three are done, no date is promised.',
        },
        {
          type: 'read',
          title: 'The first 30 days',
          points: [
            'A reply inside one hour in business hours.',
            'A named support person for that client.',
            'One open call a week for their office: 30 minutes, bring any question.',
            'Every morning we check: unassigned visits, jobs awaiting invoices, yesterday’s visits with no status change, Stripe not restricted, and texts sent and not filtered.',
          ],
        },
        {
          type: 'read',
          tone: 'warning',
          title: 'The warning signs',
          points: [
            'Technicians stop updating statuses',
            'The dispatcher starts a spreadsheet on the side',
            'Invoices go out from the old tool',
            'The owner stops joining the weekly call',
          ],
          body: ['Raise any one of these the same day. That client gets a call from Ethan or Mike that week.'],
        },
        {
          type: 'check',
          q: 'In week two you notice a client’s dispatcher keeping a spreadsheet next to the schedule. What do you do?',
          options: ['Leave it, it is their business', 'Wait for the day-30 review', 'Raise it the same day'],
          answer: 2,
          why: 'A second system means ours is not working for them. Catching that in week two is what the 30 days of support are for.',
        },
      ],
    },
  ],
}
