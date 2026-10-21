// Date helpers with no browser or database imports, so the pure modules (the
// pipeline, the status board, the weekly status, the team brief) can use them
// in the app, in the Node checks and inside an Edge Function alike.
//
// Two kinds here, on purpose:
//   * formatDate / getMonday / today build from LOCAL date parts. They say
//     what day it is for the person at the screen; toISOString() shifts to
//     UTC and lands on the wrong day for anyone west of Greenwich.
//   * The ISO helpers (addDays, mondayOf, ...) do arithmetic on 'YYYY-MM-DD'
//     strings in UTC, so the same input gives the same answer on a laptop in
//     Boston and a server in Virginia. Anything that starts from a date
//     string stays with these.

export function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  d.setHours(0, 0, 0, 0)
  return d
}

export function today() {
  return formatDate(new Date())
}

export function weeksAgoMonday(weeks) {
  const monday = getMonday(new Date())
  monday.setDate(monday.getDate() - weeks * 7)
  return formatDate(monday)
}

export function shortWeekLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

// --- ISO string arithmetic, UTC ---------------------------------------------------

const MS_DAY = 86400000
const utc = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)
const iso = (d) => d.toISOString().slice(0, 10)

/** 'YYYY-MM-DD' plus n days (n may be negative). */
export function addDays(day, n) {
  return iso(new Date(utc(day).getTime() + n * MS_DAY))
}

/** Whole days from a to b; negative when b is earlier. */
export function daysBetween(a, b) {
  return Math.round((utc(b) - utc(a)) / MS_DAY)
}

/** 0 Sunday .. 6 Saturday, for a 'YYYY-MM-DD'. */
export function dayOfWeek(day) {
  return utc(day).getUTCDay()
}

/** The Monday of the week holding this day, as 'YYYY-MM-DD'. */
export function mondayOf(day) {
  const dow = dayOfWeek(day)
  return addDays(day, dow === 0 ? -6 : 1 - dow)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 'Oct 13' for '2026-10-13'. */
export function shortDay(day) {
  const d = utc(day)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

/** 'Oct 13 to 19', or 'Oct 27 to Nov 2' across a month end, for the week starting on this Monday. */
export function weekRangeLabel(monday) {
  const end = addDays(monday, 6)
  const a = utc(monday)
  const b = utc(end)
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()} to ${b.getUTCDate()}`
    : `${shortDay(monday)} to ${shortDay(end)}`
}

/** 'Tuesday, Oct 21' for a 'YYYY-MM-DD'. */
export function longDay(day) {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return `${names[dayOfWeek(day)]}, ${shortDay(day)}`
}
