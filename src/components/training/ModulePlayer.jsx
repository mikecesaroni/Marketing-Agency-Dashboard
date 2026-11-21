import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Badge, Button, Card } from '../ui'
import { moduleKey, moduleStatus, resumeStep } from '../../lib/training/engine'

/**
 * One module, two ways.
 *
 * STEP BY STEP is how it is learned: one card on screen, a question every
 * few cards that has to be answered before moving on, and the position saved
 * the moment a card is cleared. READ ALL is how it is used afterwards: every
 * card on one page with the answers showing, for somebody who has done the
 * course and needs the one rule again. The search on the Training home lands
 * there.
 *
 * A question can be tried as often as it takes. It is not scored; the quiz
 * at the end of the course is where a score is kept.
 */

const SAVE_LABEL = { saving: 'Saving…', saved: 'Saved', error: 'Not saved' }

function ReadCard({ card }) {
  const tone = card.tone === 'standard' ? 'info' : card.tone === 'warning' ? 'warning' : 'default'
  return (
    <Card tone={tone} padding="lg">
      {card.tone === 'standard' && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700">Our standard</p>}
      {card.tone === 'warning' && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">Watch out</p>}
      <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
      {(card.body || []).map((p, i) => (
        <p key={i} className="mt-2 text-[15px] leading-relaxed text-slate-700">
          {p}
        </p>
      ))}
      {card.points?.length > 0 && (
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-slate-700">
          {card.points.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function DoCard({ card, ticked, onTick, reference }) {
  return (
    <Card tone="success" padding="lg">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-green-700">Go and do it</p>
      <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
      {(card.body || []).map((p, i) => (
        <p key={i} className="mt-2 text-[15px] leading-relaxed text-slate-700">
          {p}
        </p>
      ))}
      {card.look?.length > 0 && (
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-slate-700">
          {card.look.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={card.to}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {card.label} ↗
        </a>
        {!reference && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={ticked} onChange={(e) => onTick(e.target.checked)} className="h-4 w-4 accent-green-600" />
            I did it
          </label>
        )}
      </div>
    </Card>
  )
}

function CheckCard({ card, picked, onPick, reference }) {
  const solved = reference || picked === card.answer
  return (
    <Card padding="lg">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Quick check</p>
      <h3 className="text-lg font-semibold text-slate-900">{card.q}</h3>
      <div className="mt-3 space-y-2">
        {card.options.map((option, i) => {
          const right = i === card.answer
          const chosen = picked === i
          const cls = solved && right ? 'border-green-500 bg-green-50 text-slate-900' : chosen && !right ? 'border-red-300 bg-red-50 text-slate-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
          return (
            <button
              key={i}
              type="button"
              disabled={solved}
              onClick={() => onPick(i)}
              className={`block w-full rounded-lg border px-3 py-2.5 text-left text-sm transition disabled:cursor-default ${cls}`}
            >
              {option}
            </button>
          )
        })}
      </div>
      {!solved && Number.isInteger(picked) && <p className="mt-3 text-sm font-medium text-red-700">Not that one. Have another go.</p>}
      {solved && (
        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          {!reference && <span className="font-semibold text-green-700">Right. </span>}
          {card.why}
        </p>
      )}
    </Card>
  )
}

export default function ModulePlayer({ course, mod, training }) {
  const { myRows, save, saveState, signedIn } = training
  const navigate = useNavigate()
  const location = useLocation()
  const row = myRows.find((r) => r.module_key === moduleKey(course.id, mod.id)) || null
  const status = moduleStatus(mod, row)
  const total = mod.cards.length

  const wantsAll = new URLSearchParams(location.search).get('view') === 'all'
  const [view, setView] = useState(wantsAll ? 'all' : 'steps')
  const [index, setIndex] = useState(() => resumeStep(mod, row))
  // Cards cleared on this visit. A finished module starts back at zero so a
  // re-read asks the questions again, without undoing what is saved.
  const [cleared, setCleared] = useState(() => (row && !row.done ? Math.min(row.step || 0, total) : 0))
  const [picked, setPicked] = useState({})
  const [ticked, setTicked] = useState({})
  const [finished, setFinished] = useState(false)

  const card = mod.cards[index]
  const pastIt = index < cleared
  const canNext = pastIt || card.type === 'read' || (card.type === 'check' && picked[index] === card.answer) || (card.type === 'do' && ticked[index])

  const next = () => {
    if (!canNext) return
    const done = Math.max(cleared, index + 1)
    setCleared(done)
    save(course.id, mod, done)
    if (index + 1 >= total) setFinished(true)
    else setIndex(index + 1)
    window.scrollTo({ top: 0 })
  }
  const back = () => {
    if (finished) setFinished(false)
    else if (index > 0) setIndex(index - 1)
  }

  // Arrow keys and Enter, the way a slideshow works. Left alone while
  // somebody is in a form control so a checkbox still takes a space.
  useEffect(() => {
    if (view !== 'steps') return undefined
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return
      if (e.key === 'ArrowRight' || (e.key === 'Enter' && e.target?.tagName !== 'BUTTON' && e.target?.tagName !== 'A')) next()
      if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Search results land on one card of the reference view.
  useEffect(() => {
    if (view !== 'all' || !location.hash) return
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [view, location.hash])

  const position = course.modules.findIndex((m) => m.id === mod.id)
  const after = course.modules[position + 1] || null

  const header = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">
          <Link to="/training" className="hover:text-slate-700">
            Training
          </Link>{' '}
          /{' '}
          <Link to={`/training/${course.id}`} className="hover:text-slate-700">
            {course.title}
          </Link>
        </p>
        <h2 className="mt-0.5 text-xl font-semibold text-slate-900">{mod.title}</h2>
        {status === 'updated' && (
          <p className="mt-1 text-sm text-amber-700">This module changed since you finished it. Go through it again to clear the flag.</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {view === 'steps' && saveState !== 'idle' && (
          <span className={`text-xs ${saveState === 'error' ? 'font-medium text-red-700' : 'text-slate-500'}`}>
            {signedIn ? SAVE_LABEL[saveState] : 'Not saved: nobody is signed in'}
          </span>
        )}
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
          {[
            ['steps', 'Step by step'],
            ['all', 'Read all'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`rounded-md px-2.5 py-1.5 transition ${view === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  if (view === 'all') {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        <p className="mb-3 text-xs text-slate-500">
          Everything in this module on one page, answers showing. Last changed {mod.updated}.
        </p>
        <div className="space-y-3">
          {mod.cards.map((c, i) => (
            <div key={i} id={`card-${i}`} className="scroll-mt-28">
              {c.type === 'read' && <ReadCard card={c} />}
              {c.type === 'do' && <DoCard card={c} reference />}
              {c.type === 'check' && <CheckCard card={c} reference />}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      {header}
      <div className="mb-4 flex gap-1" aria-label={`Card ${index + 1} of ${total}`}>
        {mod.cards.map((_, i) => (
          <button
            key={i}
            type="button"
            disabled={i > cleared}
            onClick={() => {
              setFinished(false)
              setIndex(i)
            }}
            aria-label={`Card ${i + 1}`}
            className={`h-1.5 flex-1 rounded-full transition disabled:cursor-default ${
              finished || i < cleared ? 'bg-green-500' : i === index ? 'bg-blue-500' : 'bg-slate-200'
            }`}
          />
        ))}
      </div>

      {finished ? (
        <Card tone="success" padding="lg">
          <p className="text-2xl font-bold text-slate-900">Module done</p>
          <p className="mt-1 text-sm text-slate-700">
            {after ? `Next up: ${after.title}.` : 'That was the last module. The quiz is next: 20 questions, open book.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="dark" onClick={() => navigate(after ? `/training/${course.id}/${after.id}` : `/training/${course.id}/quiz`)}>
              {after ? 'Next module' : 'Take the quiz'}
            </Button>
            <Button variant="outline" onClick={() => navigate(`/training/${course.id}`)}>
              Back to {course.title}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {card.type === 'read' && <ReadCard card={card} />}
          {card.type === 'do' && <DoCard card={card} ticked={pastIt || Boolean(ticked[index])} onTick={(v) => setTicked((t) => ({ ...t, [index]: v }))} />}
          {card.type === 'check' && (
            <CheckCard card={card} picked={pastIt ? card.answer : picked[index]} onPick={(i) => setPicked((p) => ({ ...p, [index]: i }))} />
          )}
          {/* Room on the right for the floating Help button, which would
              otherwise sit on top of Next on a phone or a narrow window. */}
          <div className="mt-4 flex items-center justify-between gap-3 pr-28 xl:pr-0">
            <Button variant="ghost" onClick={back} disabled={index === 0}>
              Back
            </Button>
            <div className="flex items-center gap-3">
              <Badge>
                {index + 1} of {total}
              </Badge>
              <Button variant="dark" onClick={next} disabled={!canNext}>
                {index + 1 >= total ? 'Finish' : 'Next'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
