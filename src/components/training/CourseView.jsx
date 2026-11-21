import { Link } from 'react-router-dom'
import { Badge, Button, Card } from '../ui'
import { courseProgress } from '../../lib/training/engine'

/** One course: its modules in order with where you are on each, then the quiz. */

const STATUS = {
  new: { label: 'Not started', tone: 'neutral', action: 'Start' },
  started: { label: 'In progress', tone: 'info', action: 'Continue' },
  done: { label: 'Done', tone: 'success', action: 'Review' },
  updated: { label: 'Updated since you finished', tone: 'warning', action: 'See what changed' },
}

export function ProgressBar({ percent, className = '' }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-slate-200 ${className}`} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-all ${percent >= 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${percent}%` }} />
    </div>
  )
}

export default function CourseView({ course, training }) {
  const p = courseProgress(course, training.myRows, training.myAttempts)
  const minutes = course.modules.reduce((sum, m) => sum + (m.minutes || 0), 0)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card padding="lg">
        <p className="text-xs text-slate-500">
          <Link to="/training" className="hover:text-slate-700">
            Training
          </Link>
        </p>
        <div className="mt-0.5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-slate-900">{course.title}</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">{course.blurb}</p>
          </div>
          {p.complete ? <Badge tone="success">Course complete</Badge> : <Badge>About {minutes} minutes, plus the quiz</Badge>}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <ProgressBar percent={p.percent} className="flex-1" />
          <span className="whitespace-nowrap text-xs font-medium text-slate-600">
            {p.done} of {p.total} modules{p.quizPassed ? ', quiz passed' : ''}
          </span>
        </div>
      </Card>

      <div className="space-y-2">
        {p.modules.map(({ mod, row, status }, i) => {
          const s = STATUS[status]
          return (
            <Card key={mod.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    status === 'done' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {status === 'done' ? '✓' : i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{mod.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {mod.minutes} min
                    {status === 'started' && row ? ` · card ${Math.min(row.step + 1, mod.cards.length)} of ${mod.cards.length}` : ''}
                    {mod.note ? ` · ${mod.note}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={s.tone}>{s.label}</Badge>
                <Link to={`/training/${course.id}/${mod.id}`}>
                  <Button variant={status === 'done' ? 'outline' : 'dark'} size="sm">
                    {s.action}
                  </Button>
                </Link>
              </div>
            </Card>
          )
        })}

        <Card tone={p.quizPassed ? 'success' : 'default'} className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-slate-900">The quiz</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {course.quiz.questions.length} questions, {course.quiz.passMark} to pass, open book
              {p.quizBest !== null ? ` · your best: ${p.quizBest}` : ''}
              {p.quizTries > 0 ? ` · ${p.quizTries} ${p.quizTries === 1 ? 'try' : 'tries'}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {p.quizPassed ? <Badge tone="success">Passed</Badge> : p.done < p.total ? <Badge>Best after the modules</Badge> : <Badge tone="info">Ready</Badge>}
            <Link to={`/training/${course.id}/quiz`}>
              <Button variant={p.quizPassed ? 'outline' : 'dark'} size="sm">
                {p.quizPassed ? 'Open' : 'Take the quiz'}
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
