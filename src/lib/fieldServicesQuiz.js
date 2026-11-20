// The Field Services quiz: level 1 of the four a team member clears before
// running a client onboarding alone (Learn, Build, Shadow, Lead).
//
// Twenty questions, eighteen to pass. Half are about how HighLevel's Field
// Services behaves and half are about our own rules for building a client on
// it, because somebody who knows the screens and not the rules is the one
// who sets an industry on the wrong account.
//
// VERSIONED ON PURPOSE. Field Services is a beta and the HighLevel half was
// written from its help pages before anybody here had used it. When a
// question turns out wrong on a real account, fix it and bump `id`
// (field-services-v2): an attempt is stored with the id it was taken
// against, so an old pass stays an honest record of what was asked.
//
// Each question's `study` names the section of the "Field Services: study
// guide" SOP that answers it. A failed attempt shows that, never the answer.
//
// Pure: scripts/check-field-services-quiz.mjs imports it, so nothing here
// may touch React, the DOM or supabaseClient.

export const FIELD_SERVICES_QUIZ = {
  id: 'field-services-v1',
  title: 'Field Services: level 1',
  passMark: 18,
  questions: [
    {
      id: 'industry',
      study: 'Turning it on',
      q: 'You are about to set a client account’s industry to Field services. What is true?',
      options: [
        'One industry per account, and it cannot be changed or removed later without HighLevel support',
        'It can be switched back at any time from Features and Limits',
        'It wipes the calendars and workflows already in the account',
        'It only applies to new accounts, never to an existing one',
      ],
      answer: 0,
      why: 'One industry per account, and only HighLevel support can undo it. Check the account twice before you click.',
    },
    {
      id: 'first-step',
      study: 'The setup order',
      q: 'What is the first thing we set up when we build a client?',
      options: [
        'The booking page',
        'Service areas, and the rule for bookings outside them',
        'The mobile app on every tech’s phone',
        'Notifications',
      ],
      answer: 1,
      why: 'Service areas come first. Staff, services and the booking page all depend on them.',
    },
    {
      id: 'by-hand',
      study: 'The setup order',
      q: 'Why is every client built by hand from the SOP?',
      options: [
        'Clients ask for it',
        'It is faster than copying',
        'HighLevel has no way yet to copy a finished Field Services setup to another account',
        'Copying a setup would cost extra',
      ],
      answer: 2,
      why: 'Snapshots for Field Services are listed as upcoming. Until then the setup order is the SOP.',
    },
    {
      id: 'home-standard',
      study: 'Home',
      q: 'What is our standard for a client’s Home screen each morning?',
      options: [
        'Every invoice is paid by noon',
        'The dispatcher exports the schedule to PDF',
        'Every estimate has been approved',
        '“Unassigned visits” and “Requests requiring action” are at zero by 10am',
      ],
      answer: 3,
      why: 'Those two counts are the ones that turn into missed jobs. Zero by 10am, every day.',
    },
    {
      id: 'outside-area',
      study: 'Service areas',
      q: 'A customer outside the service area tries to book. What is our standard setting?',
      options: [
        'Block the booking',
        'Allow it with a review flag, so a person decides',
        'Allow it with no flag',
        'Send them to a competitor',
      ],
      answer: 1,
      why: 'Flag it for review. We never block a paying customer silently.',
    },
    {
      id: 'zip-list',
      study: 'Service areas',
      q: 'How do we set a client’s coverage?',
      options: [
        'A radius around the office',
        'The whole state, then narrow it later',
        'A list of ZIP codes, the same ones we target their ads to',
        'Whatever the Default area came with',
      ],
      answer: 2,
      why: 'ZIP lists, matched to the ads, so a lead we paid for is always inside the area.',
    },
    {
      id: 'tech-login',
      study: 'The technician app',
      q: 'How does a technician get into the mobile app?',
      options: [
        'With the office’s shared login',
        'With our agency login',
        'With a link sent by text, no login needed',
        'With their own login, as a user on the client’s account',
      ],
      answer: 3,
      why: 'Each tech is a user on the client’s account and signs in as themself. Logins are never shared.',
    },
    {
      id: 'csv-duplicate',
      study: 'Services and add-ons',
      q: 'You import a services CSV and one service name already exists in the account. What happens to that row?',
      options: [
        'It is skipped, not updated',
        'It overwrites the existing service',
        'A second copy is created',
        'The whole import fails',
      ],
      answer: 0,
      why: 'Existing names are skipped. To change a price, edit the service itself.',
    },
    {
      id: 'convert-to-job',
      study: 'Requests and the booking page',
      q: 'A request comes in and the customer has already agreed the price on the phone. What is the right move?',
      options: [
        'Delete the request and create a new job',
        'Convert to estimate and wait for approval',
        'Open the three-dots menu and choose Convert to job',
        'Leave it as a request until the work is done',
      ],
      answer: 2,
      why: 'Convert to job skips the estimate and carries the customer and the work across.',
    },
    {
      id: 'ai-chat-only',
      study: 'Requests and the booking page',
      q: 'How does the built-in AI receptionist take a request today?',
      options: [
        'By phone call',
        'By chat only',
        'By phone call and chat',
        'It cannot take requests',
      ],
      answer: 1,
      why: 'Chat only. Voice is not there yet, so calls go through our own front desk and the office adds the request.',
    },
    {
      id: 'statuses',
      study: 'Jobs and visits',
      q: 'Who sets a job’s status, such as Scheduled, In progress or Ready to invoice?',
      options: [
        'The dispatcher, from a dropdown',
        'The technician, at the end of the day',
        'We do, in the weekly review',
        'Nobody. Statuses set themselves as the work moves',
      ],
      answer: 3,
      why: 'Statuses are automatic. If one looks wrong, something upstream was skipped, usually a visit update on the phone.',
    },
    {
      id: 'visits',
      study: 'Jobs and visits',
      q: 'One customer needs three trips to the same house for the same work. How is that set up?',
      options: [
        'One job with three visits',
        'Three separate jobs',
        'Three requests',
        'One visit with three techs',
      ],
      answer: 0,
      why: 'A job is one customer at one address, with as many visits as it needs.',
    },
    {
      id: 'best-match',
      study: 'Schedule, dispatch and routes',
      q: 'In Find availability, what does a slot tagged “Best match” mean?',
      options: [
        'The soonest slot',
        'The customer’s preferred tech',
        'The slot with the shortest drive',
        'The highest-priced slot',
      ],
      answer: 2,
      why: '“Best match” is the shortest drive. “Earliest” is the soonest.',
    },
    {
      id: 'lock-visit',
      study: 'Schedule, dispatch and routes',
      q: 'You are about to optimize a tech’s route, and one visit has a time the customer was promised. What do you do first?',
      options: [
        'Move that visit to tomorrow',
        'Lock that visit, then optimize',
        'Optimize, then call the customer if it moved',
        'Skip route optimization for that tech',
      ],
      answer: 1,
      why: 'A locked visit stays put and the rest of the day is reordered around it.',
    },
    {
      id: 'jobs-missing',
      study: 'The technician app',
      q: 'A tech opens the HighLevel app and there is no Jobs section. What is the most likely cause?',
      options: [
        'The phone is too old',
        'The tech has no visits today',
        'Stripe is not connected',
        'Field Services was not set up on the web first',
      ],
      answer: 3,
      why: 'Jobs only appears in the app once Field Services is set up on the web for that account.',
    },
    {
      id: 'stripe-only',
      study: 'Invoices and payments',
      q: 'Tap to Pay and cards on file need which payment provider?',
      options: ['Any provider HighLevel supports', 'Stripe', 'PayPal', 'None. They work with no provider'],
      answer: 1,
      why: 'Stripe only. That is why Stripe is connected and verified before a cutover date is set.',
    },
    {
      id: 'review-request',
      study: 'Customer and team messages',
      q: 'How does a customer get a review request after a visit?',
      options: [
        'Field Services sends it when the visit is completed',
        'The technician sends it from the app',
        'From a normal GoHighLevel workflow, or by hand. Field Services has no review request',
        'It cannot be done',
      ],
      answer: 2,
      why: 'Review request is not in the Field Services notification list, so it comes from a normal workflow until HighLevel adds it.',
    },
    {
      id: 'sandbox',
      study: 'Our rules',
      q: 'Where does a new team member practice a build?',
      options: [
        'On the sandbox account, never a client’s',
        'On the newest client, with the GHL lead watching',
        'On whichever client has the fewest jobs',
        'On a copy of a live client account',
      ],
      answer: 0,
      why: 'HighLevel has no test copy of a live account, so practice happens on the sandbox and nowhere else.',
    },
    {
      id: 'cutover',
      study: 'Our rules',
      q: 'When can a client’s cutover date be set?',
      options: [
        'On the kickoff call',
        'As soon as the services are loaded',
        'When the owner asks for one',
        'Only when Stripe is verified, texting is registered and every tech can log in',
      ],
      answer: 3,
      why: 'All three are started at kickoff, and no date is promised until all three are done.',
    },
    {
      id: 'shadow-system',
      study: 'Our rules',
      q: 'In week two a client’s dispatcher starts keeping a spreadsheet on the side. What do you do?',
      options: [
        'Nothing. It is their business',
        'Raise it the same day. It is a warning sign and the client gets a call that week',
        'Wait for the day-30 review',
        'Import the spreadsheet for them each week',
      ],
      answer: 1,
      why: 'A second system means the first one is not working for them. Catching it in week two is what the 30 days of support are for.',
    },
  ],
}

/**
 * Score one attempt.
 *
 * `answers` maps a question id to the index of the option chosen, in the
 * order the options are written above (the page shuffles what it shows and
 * maps back before calling this). An unanswered question is a wrong one.
 */
export function gradeQuiz(quiz, answers) {
  const picked = answers || {}
  const wrong = quiz.questions.filter((q) => picked[q.id] !== q.answer).map((q) => q.id)
  const total = quiz.questions.length
  const score = total - wrong.length
  return { score, total, passed: score >= quiz.passMark, wrong }
}

/** How many questions still have no answer. */
export function unanswered(quiz, answers) {
  const picked = answers || {}
  return quiz.questions.filter((q) => !Number.isInteger(picked[q.id])).length
}

/**
 * A shuffled order for each question's options, so nobody passes by
 * remembering "A, B, C". `random` is injectable for the check.
 * Returns { [questionId]: [original option indexes in display order] }.
 */
export function shuffledOptions(quiz, random = Math.random) {
  const out = {}
  for (const q of quiz.questions) {
    const order = q.options.map((_, i) => i)
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    out[q.id] = order
  }
  return out
}

/**
 * The newest attempt per person for one quiz, best result first: who has
 * passed, who has not yet, and how many tries each took.
 * rows: [{ user_id, name, quiz_id, score, total, passed, created_at }]
 */
export function latestByPerson(rows, quizId) {
  const mine = (rows || []).filter((r) => r.quiz_id === quizId)
  const byUser = new Map()
  for (const r of mine) {
    const cur = byUser.get(r.user_id) || { user_id: r.user_id, name: r.name || 'Unnamed', attempts: 0, passed: false, best: 0, total: r.total, last: null }
    cur.attempts += 1
    cur.passed = cur.passed || Boolean(r.passed)
    cur.best = Math.max(cur.best, r.score || 0)
    if (!cur.last || r.created_at > cur.last) {
      cur.last = r.created_at
      cur.name = r.name || cur.name
    }
    byUser.set(r.user_id, cur)
  }
  return [...byUser.values()].sort((a, b) => Number(b.passed) - Number(a.passed) || b.best - a.best || a.name.localeCompare(b.name))
}
