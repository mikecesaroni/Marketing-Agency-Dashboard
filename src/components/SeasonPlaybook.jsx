import { TEMPLATE_LAYOUTS } from '../lib/adTemplateMeta'
import { TRADE_WORDS } from '../lib/seasonPlaybook'

const label = (key) => TEMPLATE_LAYOUTS.find((t) => t.key === key)?.label || key

/**
 * The season playbook card on the Design tab: what this trade is selling
 * right now in this market, the tactics, the offer shapes, and the
 * templates that say it best. One click applies a template. The live line
 * says which template the words on the form call for; "Use it" applies it
 * and "Next best" walks down the ranking. "Write one ad for right now" has
 * the chat write an ad to the playbook (and to the template on the
 * artboards when one is picked).
 */
export default function SeasonPlaybook({ phase, best = [], layout, live, onPick, onUseLive, onNextBest, onWriteOne, writing = false, market }) {
  if (!phase) return null
  const where = market ? ` in ${market}` : ''
  const onTemplate = TEMPLATE_LAYOUTS.some((t) => t.key === layout)
  return (
    <details className="rounded-lg border border-sky-200 bg-sky-50/60 p-3" open data-season-playbook data-phase={phase.key}>
      <summary className="cursor-pointer text-xs font-semibold text-slate-800">
        Season playbook: {phase.label}
        <span className="ml-1 font-normal text-slate-500">
          {TRADE_WORDS[phase.trade] || 'home services'}{where}, {phase.month}
        </span>
      </summary>
      <div className="mt-2 space-y-2 text-xs text-slate-700">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onWriteOne('')}
            disabled={writing}
            title="The chat writes one ad to this playbook, picks the template that says it best, and puts it on the artboards"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
            data-write-one
          >
            {writing ? 'Writing…' : '✨ Write one ad for right now'}
          </button>
          {onTemplate && (
            <button
              type="button"
              onClick={() => onWriteOne(layout)}
              disabled={writing}
              title="The chat writes one ad shaped for the template on the artboards"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-orange-800 bg-white border border-orange-300 hover:bg-orange-50 disabled:opacity-50"
              data-write-for
            >
              ✍️ Write an ad for {label(layout)}
            </button>
          )}
        </div>
        <p>{phase.summary}</p>
        <ul className="list-disc space-y-0.5 pl-4">
          {phase.tactics.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {phase.offers.length > 0 && (
          <p>
            <span className="font-medium">Offer shapes that fit:</span> {phase.offers.join(' · ')}
          </p>
        )}
        {phase.avoid?.length > 0 && (
          <p className="text-slate-500">
            <span className="font-medium">Leave out:</span> {phase.avoid.join(' · ')}
          </p>
        )}
        {phase.moments?.length > 0 && (
          <p className="text-slate-500">
            <span className="font-medium">Coming up:</span>{' '}
            {phase.moments
              .slice(0, 3)
              .map((x) => `${x.name} (${x.days <= 0 ? 'this week' : `in ${x.days} days`})`)
              .join(' · ')}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-0.5 font-medium">Best templates now</span>
          {best.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onPick(t.key)}
              title={t.why}
              aria-pressed={layout === t.key}
              data-playbook-pick={t.key}
              className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                layout === t.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
              }`}
            >
              {label(t.key)}
            </button>
          ))}
        </div>
        {live && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-sky-200 bg-white px-2 py-1.5" data-live-pick={live.key}>
            <span>
              <span className="font-medium">For these words:</span> {label(live.key)}
              <span className="text-slate-500"> · {live.reason}</span>
            </span>
            {layout !== live.key ? (
              <button type="button" onClick={onUseLive} className="px-2 py-0.5 rounded text-[11px] font-medium text-white bg-slate-900 hover:bg-slate-700" data-use-live>
                Use it
              </button>
            ) : (
              <span className="text-[11px] text-green-700">on the artboards</span>
            )}
            <button type="button" onClick={onNextBest} title="The next template down the ranking for these words" className="px-2 py-0.5 rounded text-[11px] font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100" data-next-best>
              Next best ↓
            </button>
          </div>
        )}
      </div>
    </details>
  )
}
