import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { Badge, Button, Card, Table, TBody, THead, Td, Th, Tr } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../lib/access'
import { FIELD_SERVICES_QUIZ as QUIZ, gradeQuiz, latestByPerson, shuffledOptions, unanswered } from '../lib/fieldServicesQuiz'
import { supabase } from '../lib/supabaseClient'

/**
 * Training: the quiz a team member passes before they build for a client.
 *
 * One quiz today (Field Services, level 1). The questions and the grading
 * live in src/lib/fieldServicesQuiz.js; this page shows them, saves each
 * attempt to quiz_attempts, and shows an admin who has passed.
 *
 * A failed attempt names the questions missed and where to read up, never
 * the right answer: the point is that they go back to the study guide. A
 * passed one shows the answers to anything missed, since there is nothing
 * left to protect.
 */

const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export default function TrainingPage() {
  const { user, profile, role } = useAuth()
  const admin = isAdmin(role)
  const [attempts, setAttempts] = useState([])
  const [loadError, setLoadError] = useState('')
  const [stage, setStage] = useState('intro') // intro | taking | result
  const [order, setOrder] = useState({})
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const load = async () => {
    // Row-level security decides what comes back: everyone's for an admin,
    // only their own for anybody else.
    const { data, error } = await supabase
      .from('quiz_attempts')
      .select('id, user_id, name, quiz_id, score, total, passed, wrong, created_at')
      .eq('quiz_id', QUIZ.id)
      .order('created_at', { ascending: false })
    if (error) setLoadError(error.message)
    else {
      setAttempts(data || [])
      setLoadError('')
    }
  }

  useEffect(() => {
    load()
  }, [])

  const mine = useMemo(() => attempts.filter((a) => a.user_id === user?.id), [attempts, user?.id])
  const myPass = mine.find((a) => a.passed)
  const board = useMemo(() => latestByPerson(attempts, QUIZ.id), [attempts])
  // Which questions the team gets wrong most. A question most people miss is
  // a bad question or a hole in the study guide, and the weekly review is
  // where that gets fixed.
  const mostMissed = useMemo(() => {
    const counts = new Map()
    for (const a of attempts) for (const id of a.wrong || []) counts.set(id, (counts.get(id) || 0) + 1)
    return [...counts.entries()]
      .map(([id, n]) => ({ q: QUIZ.questions.find((q) => q.id === id), n }))
      .filter((m) => m.q)
      .sort((a, b) => b.n - a.n)
      .slice(0, 3)
  }, [attempts])

  const start = () => {
    setOrder(shuffledOptions(QUIZ))
    setAnswers({})
    setResult(null)
    setSaveError('')
    setStage('taking')
    window.scrollTo({ top: 0 })
  }

  const left = unanswered(QUIZ, answers)

  const submit = async () => {
    const graded = gradeQuiz(QUIZ, answers)
    setResult(graded)
    setStage('result')
    window.scrollTo({ top: 0 })
    // With login switched off there is nobody to record it against. The
    // score still shows; it just is not kept.
    if (!user) {
      setSaveError('Nobody is signed in, so this attempt was not saved.')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('quiz_attempts').insert({
      user_id: user.id,
      name: profile?.name || profile?.email || user.email || null,
      quiz_id: QUIZ.id,
      score: graded.score,
      total: graded.total,
      passed: graded.passed,
      wrong: graded.wrong,
    })
    setSaving(false)
    if (error) setSaveError(`This attempt was not saved: ${error.message}`)
    else load()
  }

  return (
    <Layout title="Training" subtitle="What the team passes before building for a client">
      {loadError && (
        <Card tone="danger" className="mb-4 text-sm text-red-700">
          Could not load past attempts: {loadError}
        </Card>
      )}

      {stage === 'intro' && (
        <div className="space-y-4">
          <Card padding="lg">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-slate-900">{QUIZ.title}</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">
                  {QUIZ.questions.length} questions. {QUIZ.passMark} right is a pass. It is open book: read the
                  “Field Services: study guide” on the{' '}
                  <Link to="/sops" className="text-blue-600 underline underline-offset-2 hover:text-blue-700">
                    SOPs page
                  </Link>{' '}
                  first, and keep it open. Take it as many times as you need. Every attempt is recorded.
                </p>
              </div>
              {myPass ? (
                <Badge tone="success">
                  Passed {day(myPass.created_at)} · {myPass.score} of {myPass.total}
                </Badge>
              ) : mine.length > 0 ? (
                <Badge tone="warning">
                  Not passed yet · best {Math.max(...mine.map((a) => a.score))} of {QUIZ.questions.length}
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
            <p className="mt-4 max-w-2xl text-xs text-slate-500">
              This is level 1 of 4. After it: build the sandbox from the SOP alone, sit in on one whole client, then
              run one with the GHL lead watching. Passing the quiz does not clear anybody to touch a client account.
            </p>
          </Card>

          {admin && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Who has passed</h3>
              {board.length === 0 ? (
                <Card tone="muted" className="text-sm text-slate-600">
                  Nobody has taken it yet. Send the team to Training in the sidebar.
                </Card>
              ) : (
                <Table>
                  <THead>
                    <Tr>
                      <Th>Person</Th>
                      <Th>Result</Th>
                      <Th numeric>Best</Th>
                      <Th numeric>Tries</Th>
                      <Th>Last try</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {board.map((p) => (
                      <Tr key={p.user_id}>
                        <Td className="font-medium text-slate-900">{p.name}</Td>
                        <Td>{p.passed ? <Badge tone="success">Passed</Badge> : <Badge tone="warning">Not yet</Badge>}</Td>
                        <Td numeric>
                          {p.best} of {p.total}
                        </Td>
                        <Td numeric>{p.attempts}</Td>
                        <Td>{day(p.last)}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
              {mostMissed.length > 0 && (
                <Card tone="muted" className="mt-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Missed most often</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {mostMissed.map((m) => (
                      <li key={m.q.id}>
                        {m.q.q} <span className="text-slate-500">({m.n} {m.n === 1 ? 'time' : 'times'}, {m.q.study})</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-slate-500">
                    A question most people miss is a bad question or a gap in the study guide. Fix one of them.
                  </p>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {stage === 'taking' && (
        <div className="mx-auto max-w-3xl space-y-3">
          {QUIZ.questions.map((q, n) => (
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
      )}

      {stage === 'result' && result && (
        <div className="mx-auto max-w-3xl space-y-4">
          <Card tone={result.passed ? 'success' : 'warning'} padding="lg">
            <p className="text-3xl font-bold text-slate-900">
              {result.score} of {result.total}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              {result.passed
                ? 'Passed. Level 2 is next: build the sandbox from the SOP alone.'
                : `Not yet. ${QUIZ.passMark} is a pass. Read the sections below in the study guide, then take it again.`}
            </p>
            {saving && <p className="mt-2 text-xs text-slate-500">Saving this attempt…</p>}
            {saveError && <p className="mt-2 text-xs font-medium text-red-700">{saveError}</p>}
          </Card>

          {result.wrong.length > 0 && (
            <Card padding="lg">
              <h3 className="text-sm font-semibold text-slate-900">{result.passed ? 'The ones you missed' : 'Read up on these'}</h3>
              <ul className="mt-3 space-y-3">
                {QUIZ.questions
                  .filter((q) => result.wrong.includes(q.id))
                  .map((q) => (
                    <li key={q.id} className="text-sm">
                      <p className="font-medium text-slate-900">{q.q}</p>
                      {result.passed ? (
                        <p className="mt-0.5 text-slate-600">
                          <span className="font-medium text-slate-800">{q.options[q.answer]}.</span> {q.why}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-slate-600">Study guide section: {q.study}</p>
                      )}
                    </li>
                  ))}
              </ul>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            {!result.passed && (
              <Button variant="dark" onClick={start}>
                Take it again
              </Button>
            )}
            <Link to="/sops">
              <Button variant="outline">Open the SOPs</Button>
            </Link>
            <Button variant="ghost" onClick={() => setStage('intro')}>
              Back to Training
            </Button>
          </div>
        </div>
      )}
    </Layout>
  )
}
