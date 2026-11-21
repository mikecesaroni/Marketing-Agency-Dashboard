// How Training works out where somebody is.
//
// A COURSE is { id, title, blurb, tone, modules, quiz }. A MODULE is
// { id, title, minutes, version, updated, cards }. A CARD is one screen:
//
//   { type: 'read', title, body: [paragraphs], points: [bullets], tone }
//       tone 'standard' marks one of our own rules, 'warning' a trap.
//   { type: 'check', q, options, answer, why }
//       one question, answered before moving on. Not scored: it is there so
//       the reader has to use what the last screens said.
//   { type: 'do', title, body, to, label, look: [what to find] }
//       a thing to go and do in the CRM, with the link.
//
// PROGRESS is one row per person per module (training_progress): how many
// cards they have got through, whether they finished, and WHICH VERSION they
// finished. That last one is how a change gets noticed. When Google moves a
// client's Local Services Ads into Google Ads and the module is rewritten,
// its `version` goes up, and everybody who finished the old one sees
// "Updated" on it instead of a tick. Bump `version` only when what somebody
// would DO has changed, not for a typo.
//
// Pure: scripts/check-training.mjs imports it, so nothing here may touch
// React, the DOM or supabaseClient.

export const moduleKey = (courseId, moduleId) => `${courseId}/${moduleId}`

/** 'new' | 'started' | 'done' | 'updated' for one module and one person's row. */
export function moduleStatus(mod, row) {
  if (!row) return 'new'
  if (row.done) return (row.version || 1) < (mod.version || 1) ? 'updated' : 'done'
  return (row.step || 0) > 0 ? 'started' : 'new'
}

/** The card to open on: where they stopped, or the start of a finished one. */
export function resumeStep(mod, row) {
  if (!row || row.done) return 0
  return Math.max(0, Math.min(row.step || 0, mod.cards.length - 1))
}

/**
 * The row to save once somebody has got through `cardsDone` cards.
 *
 * Progress only ever moves forward: going back to re-read a card does not
 * undo anything, and a finished module stays finished. Finishing stamps the
 * module's current version, which is what clears an "Updated" flag.
 */
export function nextProgress(courseId, mod, row, cardsDone, { name = null, now = new Date().toISOString() } = {}) {
  const total = mod.cards.length
  const reached = Math.max(0, Math.min(cardsDone, total))
  const finishedNow = reached >= total
  const wasDone = Boolean(row?.done)
  const version = finishedNow ? mod.version || 1 : row?.version || 1
  return {
    module_key: moduleKey(courseId, mod.id),
    name,
    step: wasDone || finishedNow ? total : Math.max(row?.step || 0, reached),
    total,
    done: wasDone || finishedNow,
    version: wasDone && !finishedNow ? row.version || 1 : version,
    updated_at: now,
    completed_at: finishedNow ? now : row?.completed_at || null,
  }
}

/** Whether saving would change anything, so a re-read does not write a row per click. */
export function progressChanged(row, next) {
  if (!row) return true
  return row.step !== next.step || Boolean(row.done) !== next.done || (row.version || 1) !== next.version || row.total !== next.total
}

/**
 * One person's standing in one course.
 * rows: their training_progress rows; attempts: their quiz_attempts rows.
 */
export function courseProgress(course, rows, attempts) {
  const byKey = new Map((rows || []).map((r) => [r.module_key, r]))
  const modules = course.modules.map((mod) => {
    const row = byKey.get(moduleKey(course.id, mod.id)) || null
    return { mod, row, status: moduleStatus(mod, row) }
  })
  // A module rewritten since they finished it still counts as done for the
  // course: they are not sent back to zero. It is flagged, and it is the
  // first thing "next" points at once nothing is half-finished.
  const done = modules.filter((m) => m.status === 'done' || m.status === 'updated').length
  const updated = modules.filter((m) => m.status === 'updated').length
  const mine = (attempts || []).filter((a) => a.quiz_id === course.quiz.id)
  const quizPassed = mine.some((a) => a.passed)
  const quizBest = mine.length ? Math.max(...mine.map((a) => a.score || 0)) : null
  const next =
    modules.find((m) => m.status === 'started') || modules.find((m) => m.status === 'new') || modules.find((m) => m.status === 'updated') || null
  // The quiz is one more step, so finishing the reading is not shown as 100%.
  const steps = course.modules.length + 1
  const percent = Math.round(((done + (quizPassed ? 1 : 0)) / steps) * 100)
  return {
    modules,
    done,
    total: course.modules.length,
    updated,
    quizPassed,
    quizBest,
    quizTries: mine.length,
    complete: done === course.modules.length && quizPassed,
    next: next ? next.mod : null,
    percent,
  }
}

/** Every word on a card, for search. */
export function cardText(card) {
  return [card.title, ...(card.body || []), ...(card.points || []), card.q, card.why, ...(card.look || []), card.type === 'check' ? card.options?.[card.answer] : '']
    .filter(Boolean)
    .join(' ')
}

/**
 * Find cards by what they say. Every word typed has to appear on the card (or
 * in its module's title), in any order. Used as the reference search once
 * somebody has done the courses and just needs the one rule again.
 */
export function searchTraining(courses, query, limit = 12) {
  const words = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1)
  if (words.length === 0) return []
  const out = []
  for (const course of courses) {
    for (const mod of course.modules) {
      mod.cards.forEach((card, index) => {
        const text = cardText(card)
        const hay = `${mod.title} ${text}`.toLowerCase()
        if (!words.every((w) => hay.includes(w))) return
        const at = Math.max(0, text.toLowerCase().indexOf(words[0]))
        const start = Math.max(0, at - 50)
        out.push({
          courseId: course.id,
          courseTitle: course.title,
          moduleId: mod.id,
          moduleTitle: mod.title,
          index,
          title: card.title || card.q || mod.title,
          snippet: `${start > 0 ? '…' : ''}${text.slice(start, start + 150).trim()}${start + 150 < text.length ? '…' : ''}`,
        })
      })
    }
  }
  return out.slice(0, limit)
}

/**
 * Everybody's standing, for the admin's board: one line per person, one cell
 * per course. Built from all rows the admin is allowed to read.
 */
export function teamBoard(courses, rows, attempts) {
  const people = new Map()
  const person = (id, name, at) => {
    const p = people.get(id) || { user_id: id, name: name || 'Unnamed', last: null }
    if (name) p.name = name
    if (at && (!p.last || at > p.last)) p.last = at
    people.set(id, p)
    return p
  }
  for (const r of rows || []) person(r.user_id, r.name, r.updated_at)
  for (const a of attempts || []) person(a.user_id, a.name, a.created_at)
  return [...people.values()]
    .map((p) => {
      const cells = {}
      let complete = 0
      for (const course of courses) {
        const c = courseProgress(
          course,
          (rows || []).filter((r) => r.user_id === p.user_id),
          (attempts || []).filter((a) => a.user_id === p.user_id)
        )
        cells[course.id] = { done: c.done, total: c.total, quizPassed: c.quizPassed, quizBest: c.quizBest, complete: c.complete, updated: c.updated }
        if (c.complete) complete++
      }
      return { ...p, cells, complete }
    })
    .sort((a, b) => b.complete - a.complete || a.name.localeCompare(b.name))
}

/**
 * What is wrong with a course's content, as a list of plain sentences.
 * Empty means it can ship. `routes` is the list of paths the app serves, so a
 * "go and do this" card cannot point at a page that is gone.
 */
export function courseProblems(course, routes = null) {
  const problems = []
  const say = (m) => problems.push(`${course.id}: ${m}`)
  if (!course.id || !course.title || !course.blurb) say('needs an id, a title and a blurb')
  const ids = course.modules.map((m) => m.id)
  if (new Set(ids).size !== ids.length) say('two modules share an id')
  if (ids.includes('quiz')) say('"quiz" is the quiz\'s address and cannot be a module id')
  for (const mod of course.modules) {
    const at = `${mod.id}:`
    if (!mod.title || !mod.minutes || !mod.version || !mod.updated) say(`${at} needs a title, minutes, a version and an updated date`)
    if (mod.cards.length < 4 || mod.cards.length > 10) say(`${at} has ${mod.cards.length} cards; keep a module to between 4 and 10`)
    if (!mod.cards.some((c) => c.type === 'check')) say(`${at} has no check question`)
    if (mod.cards[0]?.type === 'check') say(`${at} opens with a question before saying anything`)
    mod.cards.forEach((card, i) => {
      const where = `${at} card ${i + 1}`
      if (!['read', 'check', 'do'].includes(card.type)) say(`${where} has an unknown type "${card.type}"`)
      if (/—/.test(cardText(card) + (card.options || []).join(' '))) say(`${where} uses a long dash`)
      if (card.type === 'read' && (!card.title || !(card.body?.length || card.points?.length))) say(`${where} needs a title and something to read`)
      if (card.type === 'check') {
        if (!card.q || !card.why) say(`${where} needs a question and a why`)
        if (!Array.isArray(card.options) || card.options.length < 2 || card.options.length > 4) say(`${where} needs two to four options`)
        else if (!Number.isInteger(card.answer) || card.answer < 0 || card.answer >= card.options.length) say(`${where} has an answer that points at nothing`)
        else if (new Set(card.options.map((o) => o.trim().toLowerCase())).size !== card.options.length) say(`${where} repeats an option`)
      }
      if (card.type === 'do') {
        if (!card.title || !card.to || !card.label) say(`${where} needs a title, a link and a label`)
        else if (routes && !routes.includes(card.to.split('?')[0])) say(`${where} links to ${card.to}, which the app does not serve`)
      }
    })
  }
  const quiz = course.quiz
  if (!quiz || !/-v\d+$/.test(quiz.id || '')) say('needs a quiz whose id carries a version')
  return problems
}
