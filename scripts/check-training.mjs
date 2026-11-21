// Self-check for Training. Run: node scripts/check-training.mjs
//
// The rule: A COURSE THAT SHIPS CAN BE FINISHED, ITS QUIZ CAN BE PASSED, AND
// NOBODY'S PROGRESS IS EVER LOST OR OVERSTATED. A question whose answer
// points at nothing strands the reader on that card for good; a link to a
// page that is gone sends a new hire nowhere on their first day; and a
// progress row that goes backwards makes somebody do a module twice.

import { readFileSync } from 'node:fs'
import { COURSES, findCourse } from '../src/lib/training/courses.js'
import {
  courseProblems,
  courseProgress,
  moduleKey,
  moduleStatus,
  nextProgress,
  progressChanged,
  resumeStep,
  searchTraining,
  teamBoard,
} from '../src/lib/training/engine.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const routes = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1])

// --- the content -------------------------------------------------------------

check('three courses, in this order', COURSES.map((c) => c.id), ['meta', 'google', 'field-services'])
check('a course is found by its id, and a stranger is not', [findCourse('google')?.id, findCourse('nope')], ['google', null])
for (const course of COURSES) {
  check(`${course.id}: nothing wrong with its modules`, courseProblems(course, routes), [])
  check(`${course.id}: five modules`, course.modules.length, 5)
  // "We also don't want these to be too long." A course is under an hour.
  const minutes = course.modules.reduce((s, m) => s + m.minutes, 0)
  check(`${course.id}: the reading is 40 minutes or less (${minutes})`, minutes <= 40, true)
  // The checks are there to make somebody use what they just read, so every
  // module has at least two and the right answer is not always in one place.
  check(`${course.id}: every module asks at least two questions`, course.modules.filter((m) => m.cards.filter((c) => c.type === 'check').length < 2).map((m) => m.id), [])
  const places = new Set(course.modules.flatMap((m) => m.cards.filter((c) => c.type === 'check').map((c) => c.answer)))
  check(`${course.id}: the right answer moves around`, places.size >= 3, true)

  const quiz = course.quiz
  const qs = quiz.questions
  check(`${course.id} quiz: twenty questions, eighteen to pass`, [qs.length, quiz.passMark], [20, 18])
  check(`${course.id} quiz: ids are unique`, new Set(qs.map((q) => q.id)).size, qs.length)
  check(`${course.id} quiz: four options each`, qs.filter((q) => q.options.length !== 4).map((q) => q.id), [])
  check(`${course.id} quiz: every answer points at an option`, qs.filter((q) => !Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3).map((q) => q.id), [])
  check(`${course.id} quiz: no repeated option`, qs.filter((q) => new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 4).map((q) => q.id), [])
  check(`${course.id} quiz: every question says why`, qs.filter((q) => !q.q || !q.why).map((q) => q.id), [])
  // A failed attempt links each missed question to the module that covers it.
  const moduleIds = course.modules.map((m) => m.id)
  check(`${course.id} quiz: every question belongs to a real module`, qs.filter((q) => !moduleIds.includes(q.module)).map((q) => q.id), [])
  check(`${course.id} quiz: every module is asked about`, moduleIds.filter((id) => !qs.some((q) => q.module === id)), [])
  const spread = [0, 1, 2, 3].map((i) => qs.filter((q) => q.answer === i).length)
  check(`${course.id} quiz: the right answer is spread across all four places`, spread.every((n) => n >= 3), true)
  check(`${course.id} quiz: no long dashes`, qs.filter((q) => /—/.test([q.q, q.why, ...q.options].join(' '))).map((q) => q.id), [])
}
check('every quiz has its own versioned id', new Set(COURSES.map((c) => c.quiz.id)).size, 3)
check('module keys are unique across all courses', new Set(COURSES.flatMap((c) => c.modules.map((m) => moduleKey(c.id, m.id)))).size, 15)

// --- the validator catches what it is there to catch ---------------------------

const good = {
  id: 't',
  title: 'T',
  blurb: 'b',
  quiz: { id: 't-v1' },
  modules: [
    {
      id: 'm',
      title: 'M',
      minutes: 3,
      version: 1,
      updated: '2026-11-21',
      cards: [
        { type: 'read', title: 'a', body: ['x'] },
        { type: 'check', q: 'q', options: ['a', 'b'], answer: 1, why: 'w' },
        { type: 'do', title: 'd', to: '/reports?x=1', label: 'Open' },
        { type: 'read', title: 'b', points: ['y'] },
      ],
    },
  ],
}
const broken = (change) => {
  const c = structuredClone(good)
  change(c)
  return courseProblems(c, ['/reports']).length > 0
}
check('a sound course has no problems', courseProblems(good, ['/reports']), [])
check('an answer that points at nothing is caught', broken((c) => (c.modules[0].cards[1].answer = 2)), true)
check('a link to a page the app does not serve is caught', broken((c) => (c.modules[0].cards[2].to = '/gone')), true)
check('a long dash is caught', broken((c) => (c.modules[0].cards[0].body = ['a — b'])), true)
check('a module with no question is caught', broken((c) => c.modules[0].cards.splice(1, 1, { type: 'read', title: 'z', body: ['z'] })), true)
check('a module called quiz is caught', broken((c) => (c.modules[0].id = 'quiz')), true)
check('a quiz with no version is caught', broken((c) => (c.quiz.id = 't')), true)
check('a repeated option is caught', broken((c) => (c.modules[0].cards[1].options = ['a', 'A '])), true)

// --- one person's progress -----------------------------------------------------

const meta = findCourse('meta')
const mod = meta.modules[0]
const total = mod.cards.length
const NOW = '2026-11-21T12:00:00.000Z'

check('no row is a module not started', moduleStatus(mod, null), 'new')
check('it opens on the first card', resumeStep(mod, null), 0)

let row = nextProgress('meta', mod, null, 3, { name: 'Ana', now: NOW })
check('three cards in is saved as three', [row.module_key, row.step, row.total, row.done, row.name], ['meta/delivery', 3, total, false, 'Ana'])
check('and reads as started', moduleStatus(mod, row), 'started')
check('and opens on the fourth card', resumeStep(mod, row), 3)

// Going back to re-read card one must not move the saved place backwards.
const back = nextProgress('meta', mod, row, 1, { now: NOW })
check('going back does not undo progress', back.step, 3)
check('and is not worth a write', progressChanged(row, back), false)
check('moving on is', progressChanged(row, nextProgress('meta', mod, row, 4, { now: NOW })), true)

row = nextProgress('meta', mod, row, total, { name: 'Ana', now: NOW })
check('the last card finishes it', [row.done, row.step, row.version, row.completed_at], [true, total, mod.version, NOW])
check('and reads as done', moduleStatus(mod, row), 'done')
check('a finished module opens at the start, for a re-read', resumeStep(mod, row), 0)
const reread = nextProgress('meta', mod, row, 2, { now: '2026-12-01T00:00:00.000Z' })
check('a re-read does not un-finish it', [reread.done, reread.step, reread.completed_at], [true, total, NOW])
check('past the end is still the end', nextProgress('meta', mod, null, total + 5, { now: NOW }).step, total)

// THE MOVE. When a module is rewritten its version goes up, and everybody
// who finished the old one is told, without being sent back to zero.
const rewritten = { ...mod, version: mod.version + 1 }
check('a module rewritten since they finished reads as updated', moduleStatus(rewritten, row), 'updated')
const halfway = nextProgress('meta', rewritten, row, 2, { now: NOW })
check('reading half of the new one does not clear the flag', moduleStatus(rewritten, halfway), 'updated')
const again = nextProgress('meta', rewritten, row, rewritten.cards.length, { now: NOW })
check('finishing the new one does', moduleStatus(rewritten, again), 'done')

// --- a whole course --------------------------------------------------------------

const done = (m) => ({ user_id: 'a', ...nextProgress('meta', m, null, m.cards.length, { name: 'Ana', now: NOW }) })
const fresh = courseProgress(meta, [], [])
check('nothing done is 0%, and the first module is next', [fresh.done, fresh.percent, fresh.next.id, fresh.complete], [0, 0, 'delivery', false])
const two = courseProgress(meta, [done(meta.modules[0]), { user_id: 'a', ...nextProgress('meta', meta.modules[1], null, 2, { now: NOW }) }], [])
check('one done and one started: the started one is next', [two.done, two.next.id], [1, 'structure'])
const allRead = courseProgress(meta, meta.modules.map(done), [])
check('every module read is not 100% without the quiz', [allRead.done, allRead.percent, allRead.complete, allRead.next], [5, 83, false, null])
const failed = [{ user_id: 'a', quiz_id: meta.quiz.id, score: 15, passed: false }]
check('a failed quiz is remembered and still not a pass', [courseProgress(meta, meta.modules.map(done), failed).quizBest, courseProgress(meta, meta.modules.map(done), failed).complete], [15, false])
const passed = [...failed, { user_id: 'a', quiz_id: meta.quiz.id, score: 19, passed: true }]
const finished = courseProgress(meta, meta.modules.map(done), passed)
check('all modules and a passed quiz is complete', [finished.percent, finished.complete, finished.quizBest, finished.quizTries], [100, true, 19, 2])
check('another course\'s quiz does not count', courseProgress(meta, meta.modules.map(done), [{ quiz_id: 'google-v1', score: 20, passed: true }]).quizPassed, false)
check('the quiz alone is not the course', courseProgress(meta, [], passed).complete, false)

// --- looking something up ------------------------------------------------------

const hit = (q) => searchTraining(COURSES, q).map((h) => `${h.courseId}/${h.moduleId}`)
check('a rule is found by what it says', hit('learning limited').includes('meta/delivery'), true)
check('the one-cent budget is found in the module about the move', hit('$0.01 budget').includes('google/lsa-move'), true)
check('words in any order', hit('visit lock').includes('field-services/day'), true)
check('every word has to be there', hit('learning zebra'), [])
check('nothing typed finds nothing', [searchTraining(COURSES, ''), searchTraining(COURSES, ' a ')], [[], []])
check('a result says where it is', Object.keys(searchTraining(COURSES, 'approval link')[0] || {}).sort(), ['courseId', 'courseTitle', 'index', 'moduleId', 'moduleTitle', 'snippet', 'title'])
check('results are capped', searchTraining(COURSES, 'the').length <= 12, true)

// --- the team ------------------------------------------------------------------

const rows = [
  ...meta.modules.map(done),
  { user_id: 'b', ...nextProgress('google', findCourse('google').modules[0], null, 2, { name: 'Ben', now: '2026-11-20T09:00:00.000Z' }) },
]
const attempts = [{ user_id: 'a', name: 'Ana', quiz_id: 'meta-v1', score: 19, passed: true, created_at: '2026-11-21T13:00:00.000Z' }]
const board = teamBoard(COURSES, rows, attempts)
check('one line per person, whoever is furthest first', board.map((p) => p.name), ['Ana', 'Ben'])
check('a finished course shows complete', [board[0].cells.meta.complete, board[0].cells.google.done, board[0].complete], [true, 0, 1])
check('a started one shows how far', [board[1].cells.google.done, board[1].cells.google.total, board[1].cells.meta.done], [0, 5, 0])
check('last active is the newest thing they did', board[0].last, '2026-11-21T13:00:00.000Z')
check('nobody yet is an empty board', teamBoard(COURSES, [], []), [])

console.log(failures ? `\n${failures} check(s) failed` : '\nAll Training checks pass')
process.exit(failures ? 1 : 0)
