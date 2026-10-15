import { TEMPLATE_LAYOUTS } from '../lib/adTemplateMeta'
import { TRADE_WORDS } from '../lib/seasonPlaybook'

const label = (key) => TEMPLATE_LAYOUTS.find((t) => t.key === key)?.label || key

/**
 * The season playbook card on the Design tab: what this trade is selling
 * right now in this market, the tactics, the offer shapes, and the
 * templates that say it best. One click applies a template; "Pick for these
 * words" scores every template against the words on the form.
 */
export default function SeasonPlaybook({ phase, best = [], layout, onPick, onSuggest, suggestion, market }) {
  if (!phase) return null
  const where = market ? ` in ${market}` : ''
  return (
    <details className="rounded-lg border border-sky-200 bg-sky-50/60 p-3" open data-season-playbook data-phase={phase.key}>
      <summary className="cursor-pointer text-xs font-semibold text-slate-800">
        Season playbook: {phase.label}
        <span className="ml-1 font-normal text-slate-500">
          {TRADE_WORDS[phase.trade] || 'home services'}{where}, {phase.month}
        </span>
      </summary>
      <div className="mt-2 space-y-2 text-xs text-slate-700">
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
          <button
            type="button"
            onClick={onSuggest}
            title="Scores every template against the words on the form, the season and the photos picked, and applies the best one"
            className="ml-1 px-2 py-1 rounded text-[11px] font-medium text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100"
            data-suggest-template
          >
            ✨ Pick the template for these words
          </button>
        </div>
        {suggestion && (
          <p className="text-[11px] text-slate-600" data-suggestion>
            <span className="font-medium">{label(suggestion.key)}</span>: {suggestion.reason}.
          </p>
        )}
      </div>
    </details>
  )
}
