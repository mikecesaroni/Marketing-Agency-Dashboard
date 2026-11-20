// Self-check for the Field Services quiz. Run: node scripts/check-field-services-quiz.mjs
//
// The rule: THE QUIZ IS TWENTY ANSWERABLE QUESTIONS, EIGHTEEN PASSES, AND A
// SCORE IS NEVER WRONG. A question with two right answers, an answer index
// pointing at nothing, or a grader that counts a blank as correct would all
// certify somebody who should not be.

import { FIELD_SERVICES_QUIZ as QUIZ, gradeQuiz, latestByPerson, shuffledOptions, unanswered } from '../src/lib/fieldServicesQuiz.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const qs = QUIZ.questions

// --- the shape ---------------------------------------------------------------

check('twenty questions', qs.length, 20)
check('eighteen to pass', QUIZ.passMark, 18)
check('the id carries a version', /-v\d+$/.test(QUIZ.id), true)
check('question ids are unique', new Set(qs.map((q) => q.id)).size, qs.length)
check('every question has four options', qs.filter((q) => q.options.length !== 4).map((q) => q.id), [])
check(
  'every answer points at an option',
  qs.filter((q) => !Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length).map((q) => q.id),
  []
)
check(
  'no question repeats an option',
  qs.filter((q) => new Set(q.options.map((o) => o.trim().toLowerCase())).size !== q.options.length).map((q) => q.id),
  []
)
check('every question says where to study and why', qs.filter((q) => !q.study || !q.why || !q.q).map((q) => q.id), [])
// Written with the right answer spread across the four places, so the file
// itself does not teach "it is usually the first one".
const places = [0, 1, 2, 3].map((i) => qs.filter((q) => q.answer === i).length)
check('the right answer is spread across all four places', places.every((n) => n >= 3), true)
check('no long dashes in what people read', qs.filter((q) => /—/.test([q.q, q.why, ...q.options].join(' '))).map((q) => q.id), [])

// --- grading -----------------------------------------------------------------

const allRight = Object.fromEntries(qs.map((q) => [q.id, q.answer]))
const miss = (n) => {
  const a = { ...allRight }
  for (const q of qs.slice(0, n)) a[q.id] = (q.answer + 1) % 4
  return a
}

check('all right is 20 of 20 and a pass', gradeQuiz(QUIZ, allRight), { score: 20, total: 20, passed: true, wrong: [] })
check('two wrong is 18 and still a pass', gradeQuiz(QUIZ, miss(2)).passed, true)
check('two wrong names the two', gradeQuiz(QUIZ, miss(2)).wrong, [qs[0].id, qs[1].id])
check('three wrong is 17 and a fail', [gradeQuiz(QUIZ, miss(3)).score, gradeQuiz(QUIZ, miss(3)).passed], [17, false])
check('nothing answered is 0', gradeQuiz(QUIZ, {}).score, 0)
check('no answers at all is 0, not a crash', gradeQuiz(QUIZ, null).score, 0)
const blanks = { ...allRight }
delete blanks[qs[5].id]
check('a blank is a wrong answer', gradeQuiz(QUIZ, blanks).wrong, [qs[5].id])
check('a blank is counted as unanswered', unanswered(QUIZ, blanks), 1)
check('nothing picked is twenty unanswered', unanswered(QUIZ, {}), 20)
check('an answer for a question that does not exist changes nothing', gradeQuiz(QUIZ, { ...allRight, nope: 2 }).score, 20)

// --- shuffling ---------------------------------------------------------------

let seed = 7
const random = () => {
  seed = (seed * 9301 + 49297) % 233280
  return seed / 233280
}
const order = shuffledOptions(QUIZ, random)
check('every question gets an order', Object.keys(order).length, 20)
check(
  'an order is the same four options, rearranged',
  qs.filter((q) => [...order[q.id]].sort().join() !== '0,1,2,3').map((q) => q.id),
  []
)
check('the shuffle moves something', qs.some((q) => order[q.id].join() !== '0,1,2,3'), true)

// --- who has passed ----------------------------------------------------------

const rows = [
  { user_id: 'a', name: 'Ana', quiz_id: QUIZ.id, score: 15, total: 20, passed: false, created_at: '2026-12-01T10:00:00Z' },
  { user_id: 'a', name: 'Ana', quiz_id: QUIZ.id, score: 19, total: 20, passed: true, created_at: '2026-12-02T10:00:00Z' },
  { user_id: 'b', name: 'Ben', quiz_id: QUIZ.id, score: 12, total: 20, passed: false, created_at: '2026-12-02T11:00:00Z' },
  { user_id: 'c', name: 'Cy', quiz_id: 'some-other-quiz', score: 20, total: 20, passed: true, created_at: '2026-12-02T12:00:00Z' },
]
const board = latestByPerson(rows, QUIZ.id)
check('one line per person, and only this quiz', board.map((p) => p.name), ['Ana', 'Ben'])
check('a pass on a later try counts, with the tries', [board[0].passed, board[0].attempts, board[0].best], [true, 2, 19])
check('a fail stays a fail', [board[1].passed, board[1].attempts, board[1].best], [false, 1, 12])
check('nobody yet is an empty list', latestByPerson([], QUIZ.id), [])

console.log(failures ? `\n${failures} check(s) failed` : '\nAll Field Services quiz checks pass')
process.exit(failures ? 1 : 0)
