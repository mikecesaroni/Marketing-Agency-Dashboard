import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, Table, TBody, THead, Td, Th, Tr } from '../ui'
import { courseProgress, moduleKey, searchTraining, teamBoard } from '../../lib/training/engine'
import { ProgressBar } from './CourseView'

/**
 * The front of Training: the courses with where you are on each, a way back
 * into whatever you left half-done, a search over everything the courses
 * say, and, for an admin, where everybody on the team has got to.
 */

const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '')

export default function TrainingHome({ courses, training, admin }) {
  const { myRows, myAttempts, rows, attempts } = training
  const [query, setQuery] = useState('')
  const hits = useMemo(() => searchTraining(courses, query), [courses, query])

  // The module left half-done most recently, so one click picks it back up.
  const resume = useMemo(() => {
    const open = myRows.filter((r) => !r.done && r.step > 0).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    for (const r of open) {
      for (const course of courses) {
        const mod = course.modules.find((m) => moduleKey(course.id, m.id) === r.module_key)
        if (mod) return { course, mod, row: r }
      }
    }
    return null
  }, [myRows, courses])

  const board = useMemo(() => (admin ? teamBoard(courses, rows, attempts) : []), [admin, courses, rows, attempts])

  return (
    <div className="space-y-5">
      {resume && (
        <Card tone="info" className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Pick up where you left off</p>
            <p className="mt-0.5 font-medium text-slate-900">
              {resume.course.title}: {resume.mod.title}
            </p>
            <p className="text-xs text-slate-600">
              Card {Math.min(resume.row.step + 1, resume.mod.cards.length)} of {resume.mod.cards.length}
            </p>
          </div>
          <Link to={`/training/${resume.course.id}/${resume.mod.id}`}>
            <Button variant="dark">Continue</Button>
          </Link>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {courses.map((course) => {
          const p = courseProgress(course, myRows, myAttempts)
          return (
            <Link key={course.id} to={`/training/${course.id}`} className="group block">
              <Card padding="none" className="h-full overflow-hidden transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                <div className={`bg-gradient-to-br ${course.tone} px-5 py-4 text-white`}>
                  <p className="text-lg font-bold tracking-tight">{course.title}</p>
                  <p className="mt-0.5 text-xs text-white/85">
                    {course.modules.length} modules · about {course.modules.reduce((s, m) => s + (m.minutes || 0), 0)} min
                  </p>
                </div>
                <div className="p-5">
                  <p className="text-sm text-slate-600">{course.blurb}</p>
                  <ProgressBar percent={p.percent} className="mt-4" />
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {p.complete ? (
                      <Badge tone="success">Complete</Badge>
                    ) : (
                      <Badge>
                        {p.done} of {p.total} modules
                      </Badge>
                    )}
                    {!p.complete && p.quizPassed && <Badge tone="success">Quiz passed</Badge>}
                    {p.updated > 0 && <Badge tone="warning">{p.updated} updated</Badge>}
                  </div>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>

      <Card padding="lg">
        <label htmlFor="training-search" className="text-sm font-semibold text-slate-900">
          Look something up
        </label>
        <p className="mt-0.5 text-xs text-slate-500">Searches everything the courses say. For when you have done them and need the one rule again.</p>
        <input
          id="training-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="learning phase, budget, lock a visit…"
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        {query.trim().length > 1 && (
          <div className="mt-3 divide-y divide-slate-100">
            {hits.length === 0 ? (
              <p className="py-2 text-sm text-slate-500">Nothing in the courses says that.</p>
            ) : (
              hits.map((h) => (
                <Link
                  key={`${h.courseId}/${h.moduleId}/${h.index}`}
                  to={`/training/${h.courseId}/${h.moduleId}?view=all#card-${h.index}`}
                  className="block py-2.5 transition hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-slate-900">{h.title}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{h.snippet}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {h.courseTitle} · {h.moduleTitle}
                  </p>
                </Link>
              ))
            )}
          </div>
        )}
      </Card>

      {admin && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">The team</h3>
          {board.length === 0 ? (
            <Card tone="muted" className="text-sm text-slate-600">
              Nobody has started yet. Send the team to Training in the sidebar.
            </Card>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>Person</Th>
                  {courses.map((c) => (
                    <Th key={c.id}>{c.title}</Th>
                  ))}
                  <Th>Last active</Th>
                </Tr>
              </THead>
              <TBody>
                {board.map((p) => (
                  <Tr key={p.user_id}>
                    <Td className="font-medium text-slate-900">{p.name}</Td>
                    {courses.map((c) => {
                      const cell = p.cells[c.id]
                      return (
                        <Td key={c.id}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {cell.complete ? (
                              <Badge tone="success">Complete</Badge>
                            ) : (
                              <>
                                <span className="text-slate-700">
                                  {cell.done} of {cell.total}
                                </span>
                                {cell.quizPassed ? (
                                  <Badge tone="success">Quiz passed</Badge>
                                ) : cell.quizBest !== null ? (
                                  <Badge tone="warning">Quiz best {cell.quizBest}</Badge>
                                ) : null}
                              </>
                            )}
                            {cell.updated > 0 && <Badge tone="warning">{cell.updated} to re-read</Badge>}
                          </div>
                        </Td>
                      )
                    })}
                    <Td>{day(p.last)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      )}
    </div>
  )
}
