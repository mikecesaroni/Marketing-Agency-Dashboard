import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card } from '../ui'
import { gradeQuiz, shuffledOptions, unanswered } from '../../lib/quiz'

/**
 * One course's quiz: 20 questions, a pass mark, as many tries as it takes.
 *
 * A failed attempt names the questions missed and the module that covers
 * each, never the right answer: the point is that they go back and read it.
 * A passed one shows the answers to anything missed, since there is nothing
 * left to protect. Every submitted attempt is saved and cannot be edited.
 */

const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export default function QuizRunner({ course, training, admin }) {
  const quiz = course.quiz
  const { myAttempts, attempts, recordAttempt } = training
  const [stage, setStage] = useState('intro') // intro | taking | result
  const [order, setOrder] = useState({})
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const mine = useMemo(() => myAttempts.filter((a) => a.quiz_id === quiz.id), [myAttempts, quiz.id])
  const myPass = mine.find((a) => a.passed)
  // Which questions the team gets wrong most. A question most people miss is
  // a bad question or a hole in the module, and one of the two gets fixed.
  const mostMissed = useMemo(() => {
    const counts = new Map()
    for (const a of attempts.filter((x) => x.quiz_id === quiz.id)) for (const id of a.wrong || []) counts.set(id, (counts.get(id) || 0) + 1)
    return [...counts.entries()]
      .map(([id, n]) => ({ q: quiz.questions.find((q) => q.id === id), n }))
      .filter((m) => m.q)
      .sort((a, b) => b.n - a.n)
      .slice(0, 3)
  }, [attempts, quiz])

  const moduleFor = (q) => course.modules.find((m) => m.id === q.module) || null

  const start = () => {
    setOrder(shuffledOptions(quiz))
    setAnswers({})
    setResult(null)
    setSaveError('')
    setStage('taking')
    window.scrollTo({ top: 0 })
  }

  const left = unanswered(quiz, answers)

  const submit = async () => {
    const graded = gradeQuiz(quiz, answers)
    setResult(graded)
    setStage('result')
    window.scrollTo({ top: 0 })
    setSaving(true)
    setSaveError(await recordAttempt(quiz, graded))
    setSaving(false)
  }

  const crumbs = (
    <p className="mb-1 text-xs text-slate-500">
      <Link to="/training" className="hover:text-slate-700">
        Training
      </Link>{' '}
      /{' '}
      <Link to={`/training/${course.id}`} className="hover:text-slate-700">
        {course.title}
      </Link>
    </p>
  )

  if (stage === 'taking') {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        {crumbs}
        {quiz.questions.map((q, n) => (
          <Card key={q.id} padding="lg">
            <fieldset>
              <legend className="text-sm font-semibold text-slate-900">
                <span className="mr-2 text-slate-400">{n + 1}.</span>
                {q.q}
              </legend>
              <div className="mt-3 space-y-2">
                {(order[q.id] || q.options.map((_, i) => i)).map((i) => {
                  const picked = answers[q.id] === i
                  return (
                    <label
                      key={i}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition ${
                        picked ? 'border-blue-500 bg-blue-50 text-slate-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        checked={picked}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                      />
                      <span>{q.options[i]}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          </Card>
        ))}
        {/* Sticks above the phone's tab bar (Layout's, 4rem tall and fixed),
            and to the bottom of the window on a desk. The room on the right
            is for the floating Help button, which would otherwise sit on
            top of Submit on anything narrower than a wide desk. */}
        <div className="sticky bottom-[4.75rem] z-10 rounded-xl border border-slate-200 bg-white/95 py-3 pl-4 pr-32 shadow-lg backdrop-blur md:bottom-4 xl:pr-4">
          <div className="flex items-center justify-between gap-3">
            <p className="whitespace-nowrap text-sm text-slate-600">{left === 0 ? 'All answered' : `${left} left`}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStage('intro')}>
                Leave
              </Button>
              <Button variant="dark" onClick={submit} disabled={left > 0}>
                Submit
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (stage === 'result' && result) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {crumbs}
        <Card tone={result.passed ? 'success' : 'warning'} padding="lg">
          <p className="text-3xl font-bold text-slate-900">
            {result.score} of {result.total}
          </p>
          <p className="mt-1 text-sm text-slate-700">
            {result.passed ? quiz.passed || 'Passed.' : `Not yet. ${quiz.passMark} is a pass. Go back over the parts below, then take it again.`}
          </p>
          {saving && <p className="mt-2 text-xs text-slate-500">Saving this attempt…</p>}
          {saveError && <p className="mt-2 text-xs font-medium text-red-700">{saveError}</p>}
        </Card>

        {result.wrong.length > 0 && (
          <Card padding="lg">
            <h3 className="text-sm font-semibold text-slate-900">{result.passed ? 'The ones you missed' : 'Read up on these'}</h3>
            <ul className="mt-3 space-y-3">
              {quiz.questions
                .filter((q) => result.wrong.includes(q.id))
                .map((q) => {
                  const mod = moduleFor(q)
                  return (
                    <li key={q.id} className="text-sm">
                      <p className="font-medium text-slate-900">{q.q}</p>
                      {result.passed ? (
                        <p className="mt-0.5 text-slate-600">
                          <span className="font-medium text-slate-800">{q.options[q.answer]}.</span> {q.why}
                        </p>
                      ) : mod ? (
                        <p className="mt-0.5 text-slate-600">
                          Covered in{' '}
                          <Link to={`/training/${course.id}/${mod.id}?view=all`} className="text-blue-600 underline underline-offset-2 hover:text-blue-700">
                            {mod.title}
                          </Link>
                        </p>
                      ) : (
                        <p className="mt-0.5 text-slate-600">Study guide section: {q.study}</p>
                      )}
                    </li>
                  )
                })}
            </ul>
          </Card>
        )}

        <div className="flex flex-wrap gap-2">
          {!result.passed && (
            <Button variant="dark" onClick={start}>
              Take it again
            </Button>
          )}
          <Link to={`/training/${course.id}`}>
            <Button variant="outline">Back to {course.title}</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card padding="lg">
        {crumbs}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">{quiz.title}</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              {quiz.questions.length} questions. {quiz.passMark} right is a pass. It is open book: keep the modules open in another tab. Take it as
              many times as you need. Every attempt is recorded.
            </p>
          </div>
          {myPass ? (
            <Badge tone="success">
              Passed {day(myPass.created_at)} · {myPass.score} of {myPass.total}
            </Badge>
          ) : mine.length > 0 ? (
            <Badge tone="warning">
              Not passed yet · best {Math.max(...mine.map((a) => a.score))} of {quiz.questions.length}
            </Badge>
          ) : (
            <Badge>Not taken yet</Badge>
          )}
        </div>
        <div className="mt-4">
          <Button variant="dark" onClick={start}>
            {mine.length > 0 ? 'Take it again' : 'Start the quiz'}
          </Button>
        </div>
        {quiz.note && <p className="mt-4 max-w-2xl text-xs text-slate-500">{quiz.note}</p>}
      </Card>

      {admin && mostMissed.length > 0 && (
        <Card tone="muted" className="text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Missed most often</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {mostMissed.map((m) => (
              <li key={m.q.id}>
                {m.q.q}{' '}
                <span className="text-slate-500">
                  ({m.n} {m.n === 1 ? 'time' : 'times'})
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">A question most people miss is a bad question or a gap in the module. Fix one of them.</p>
        </Card>
      )}
    </div>
  )
}
