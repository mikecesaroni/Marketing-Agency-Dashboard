import { useState } from 'react'
import { OWNER, PHASES } from '../lib/nextSteps'

/**
 * The top of every client page: where they are, what is next, whose it is,
 * and the one button that does it.
 *
 * Sticky under the page header, so the answer to "what do I do for this
 * client" is on screen wherever you have scrolled to. The whole pipeline
 * opens underneath on a click, every step with its status, its owner and
 * its action, so a teammate can see the entire launch at once and pick any
 * step without knowing where in the long page its panel lives.
 *
 * Nothing here computes anything: it renders nextSteps() and reports clicks
 * back through onAction(step), and the page decides which panel to open.
 */
function OwnerChip({ owner }) {
  return owner === OWNER.client ? (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">client</span>
  ) : (
    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-800">us</span>
  )
}

function Dot({ step }) {
  const cls = step.done
    ? 'bg-green-500'
    : step.blocked
      ? 'bg-slate-200'
      : step.owner === OWNER.client
        ? 'bg-amber-400'
        : 'bg-blue-500'
  return <span title={`${step.title}: ${step.done ? 'done' : step.blocked ? 'blocked' : 'open'}`} className={`inline-block h-2 w-2 rounded-full ${cls}`} />
}

export function PipelineStrip({ result, compact = false }) {
  if (!result) return null
  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-x-2 gap-y-0.5' : 'gap-x-3 gap-y-1'}`}>
      {PHASES.map((p) => {
        const steps = result.steps.filter((s) => s.phase === p)
        if (steps.length === 0) return null
        const current = result.phase === p
        return (
          <span key={p} className="flex items-center gap-1">
            <span className={`text-[10px] uppercase tracking-wide ${current ? 'font-semibold text-slate-900' : 'text-slate-400'}`}>{p}</span>
            <span className="flex items-center gap-0.5">
              {steps.map((s) => (
                <Dot key={s.key} step={s} />
              ))}
            </span>
          </span>
        )
      })}
    </div>
  )
}

export default function NextUpBar({ result, assignedTo, onAssign, onAction }) {
  const [open, setOpen] = useState(false)
  const [editingOwner, setEditingOwner] = useState(false)
  const [ownerDraft, setOwnerDraft] = useState(assignedTo || '')

  if (!result) return null
  const { next, ours, theirs, progress } = result

  const saveOwner = () => {
    setEditingOwner(false)
    if ((ownerDraft || '') !== (assignedTo || '')) onAssign?.(ownerDraft.trim())
  }

  return (
    <div className="sticky top-[68px] z-20 mb-6 md:top-[76px] md:mb-8">
      <div className={`rounded-xl border shadow-sm ${next ? (next.owner === OWNER.us ? 'border-blue-200 bg-blue-50/95' : 'border-amber-200 bg-amber-50/95') : 'border-green-200 bg-green-50/95'} backdrop-blur`}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Next up · {result.phase} · {progress.done}/{progress.total} done
            </p>
            {next ? (
              <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold text-slate-900">{next.title}</span>
                <OwnerChip owner={next.owner} />
                <span className="text-slate-600">{next.detail}</span>
                {next.waitingDays > 0 && <span className="text-amber-700">{next.waitingDays} day{next.waitingDays === 1 ? '' : 's'} waiting</span>}
              </p>
            ) : (
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {result.launched ? 'Running. Nothing outstanding this week.' : 'Nothing outstanding.'}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {next && (
              <button
                type="button"
                onClick={() => onAction?.(next)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${next.owner === OWNER.us ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'}`}
              >
                {next.action.label}
              </button>
            )}
            {editingOwner ? (
              <input
                autoFocus
                value={ownerDraft}
                onChange={(e) => setOwnerDraft(e.target.value)}
                onBlur={saveOwner}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveOwner()
                  if (e.key === 'Escape') setEditingOwner(false)
                }}
                placeholder="Who owns this client?"
                className="w-40 rounded border border-slate-300 px-2 py-1 text-xs"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingOwner(true)}
                title="Who on the team owns this client"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                {assignedTo ? `\u{1F464} ${assignedTo}` : 'Assign owner'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              {open ? 'Hide the plan' : `Whole plan (${ours.length} ours, ${theirs.length} on the client)`}
            </button>
          </div>

          <div className="basis-full">
            <PipelineStrip result={result} />
          </div>
        </div>

        {open && (
          <div className="border-t border-slate-200/70 bg-white/80 px-4 py-3">
            <ol className="grid gap-1.5 md:grid-cols-2">
              {result.steps.map((s) => (
                <li
                  key={s.key}
                  className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                    s.done ? 'border-green-100 bg-green-50/60' : s.blocked ? 'border-slate-100 bg-slate-50 text-slate-500' : 'border-slate-200 bg-white'
                  }`}
                >
                  <span className="mt-0.5">
                    <Dot step={s} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-1.5">
                      <span className={`font-medium ${s.done ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{s.title}</span>
                      {!s.done && <OwnerChip owner={s.owner} />}
                      {s.blocked && <span className="text-slate-400">after: {result.steps.find((x) => x.key === s.blockedBy)?.title || s.blockedBy}</span>}
                    </span>
                    <span className="block text-slate-600">{s.detail}</span>
                  </span>
                  {!s.done && !s.blocked && (
                    <button type="button" onClick={() => onAction?.(s)} className="flex-shrink-0 text-blue-600 hover:underline">
                      {s.action.label}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
