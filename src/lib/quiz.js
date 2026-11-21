// What every training quiz shares: scoring an attempt, shuffling the options,
// and working out who has passed. The questions themselves live with their
// course (src/lib/fieldServicesQuiz.js, src/lib/training/*.js).
//
// A quiz is { id, title, passMark, questions: [{ id, study, q, options,
// answer, why }] }. `id` carries a version (meta-v1): an attempt is stored
// with the id it was taken against, so when the questions change the old
// passes stay an honest record of what was asked then.
//
// Pure: the check scripts import it, so nothing here may touch React, the DOM
// or supabaseClient.

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
