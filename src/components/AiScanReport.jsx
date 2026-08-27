import { useState } from 'react'
import { CATEGORY_LABELS, TONE_CLASSES, crawlerFindings, scoreBand } from '../lib/aiVisibility'

const SEVERITY = {
  critical: { label: 'Fix first', cls: 'bg-red-100 text-red-800' },
  important: { label: 'Worth doing', cls: 'bg-amber-100 text-amber-800' },
  nice: { label: 'Edge', cls: 'bg-slate-100 text-slate-700' },
}

const IMPACT = {
  high: 'bg-green-100 text-green-800',
  medium: 'bg-blue-100 text-blue-800',
  low: 'bg-slate-100 text-slate-700',
}

function Stat({ label, value, sub }) {
  return (
    <div className="p-3 bg-white border border-slate-200 rounded-lg">
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      <p className="text-xs font-medium text-slate-600 mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// The answer text itself, folded away. It is the evidence behind every number
// above, and an owner who doubts the report will want to read it.
function PromptRow({ row }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left p-3 hover:bg-slate-50 transition flex items-start gap-3"
      >
        <span
          className={`flex-shrink-0 mt-0.5 w-2 h-2 rounded-full ${
            row.mentioned ? 'bg-green-500' : 'bg-slate-300'
          }`}
          title={row.mentioned ? 'Named in the answer' : 'Not named'}
        />
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-slate-800">{row.prompt}</span>
          <span className="block text-[11px] text-slate-500 mt-0.5">
            {CATEGORY_LABELS[row.category] || row.category}
            {row.mentioned && row.position_pct !== null && (
              <> &middot; named {row.position_pct < 35 ? 'near the top' : 'further down'}</>
            )}
            {row.cited && <> &middot; site cited</>}
            {row.status === 'failed' && <> &middot; failed</>}
          </span>
        </span>
        <span className="text-[11px] text-slate-400 flex-shrink-0">{open ? 'Hide' : 'Read'}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-slate-100 pt-2 space-y-2">
          <p className="text-xs text-slate-700 whitespace-pre-wrap">
            {row.answer || row.error || 'No answer recorded.'}
          </p>
          {row.sources?.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-slate-500 mb-1">
                What it read to answer that
              </p>
              <ul className="space-y-0.5">
                {row.sources.slice(0, 8).map((s, i) => (
                  <li key={i} className="text-[11px] truncate">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800"
                    >
                      {s.title || s.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The report. Written to be shown to the business owner, not just read
 * internally — which is why the headline leads and the evidence is one click
 * away underneath it.
 */
export default function AiScanReport({ scan }) {
  const band = scoreBand(scan.visibility_score)
  const findings = crawlerFindings(scan.crawler_audit)
  const f = scan.findings || {}

  const named = scan.prompts?.filter((p) => p.mentioned).length || 0
  const answered = scan.prompts?.filter((p) => p.status === 'done').length || 0

  // The unbranded misses are the ones that cost money — somebody was actively
  // looking to hire and got sent elsewhere.
  const unbrandedMisses =
    scan.prompts?.filter((p) => p.category === 'unbranded' && p.status === 'done' && !p.mentioned) ||
    []

  return (
    <div className="space-y-5">
      <div className={`p-4 rounded-lg border ${TONE_CLASSES[band.tone]}`}>
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-4xl font-bold tabular-nums">{scan.visibility_score ?? '—'}</span>
          <span className="text-sm font-semibold uppercase tracking-wide">{band.label}</span>
          <span className="text-xs opacity-70">AI visibility, out of 100</span>
        </div>
        {f.headline && <p className="text-sm mt-2">{f.headline}</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat
          label="Named"
          value={`${named}/${answered}`}
          sub="answers that mentioned them"
        />
        <Stat
          label="Site cited"
          value={`${Math.round((scan.citation_rate || 0) * 100)}%`}
          sub="answers citing their site"
        />
        <Stat
          label="Missed while hiring"
          value={unbrandedMisses.length}
          sub="unbranded questions"
        />
        <Stat
          label="Competitors named"
          value={f.competitors?.length || 0}
          sub="instead of them"
        />
      </div>

      {unbrandedMisses.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">
            Questions where someone was ready to hire, and they were not named
          </h3>
          <ul className="space-y-1">
            {unbrandedMisses.slice(0, 6).map((p) => (
              <li
                key={p.id}
                className="text-sm text-slate-700 pl-3 border-l-2 border-red-300 py-0.5"
              >
                &ldquo;{p.prompt}&rdquo;
              </li>
            ))}
          </ul>
        </section>
      )}

      {f.competitors?.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">Who gets named instead</h3>
          <div className="space-y-1.5">
            {f.competitors.slice(0, 8).map((c, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-2.5 bg-white border border-slate-200 rounded-lg"
              >
                <span className="text-sm font-bold text-slate-400 tabular-nums w-6 flex-shrink-0">
                  {c.appearances}&times;
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900">{c.name}</span>
                  <span className="block text-xs text-slate-600">{c.why}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {findings.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">
            What the site itself is doing wrong
          </h3>
          <p className="text-xs text-slate-500 -mt-1">
            Facts from reading the site, not opinions. These are fixable today.
          </p>
          <div className="space-y-1.5">
            {findings.map((item, i) => (
              <div key={i} className="p-2.5 bg-white border border-slate-200 rounded-lg">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${SEVERITY[item.severity].cls}`}
                  >
                    {SEVERITY[item.severity].label}
                  </span>
                  <span className="text-sm font-medium text-slate-900">{item.title}</span>
                </div>
                <p className="text-xs text-slate-600 mt-1">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {f.recommendations?.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">What to do about it</h3>
          <div className="space-y-1.5">
            {f.recommendations.map((r, i) => (
              <div key={i} className="p-2.5 bg-white border border-slate-200 rounded-lg">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${IMPACT[r.impact]}`}
                  >
                    {r.impact} impact
                  </span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wide">
                    {r.effort}
                  </span>
                  <span className="text-sm font-medium text-slate-900">{r.title}</span>
                </div>
                <p className="text-xs text-slate-600 mt-1">{r.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {f.top_sources?.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">Where the answers came from</h3>
          <p className="text-xs text-slate-500 -mt-1">
            The sites the assistant trusted. Getting listed and reviewed on these is the most
            direct way onto the answer.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {f.top_sources.slice(0, 12).map((s, i) => (
              <span
                key={i}
                className="px-2 py-1 bg-slate-100 border border-slate-200 rounded text-xs text-slate-700"
              >
                {s}
              </span>
            ))}
          </div>
        </section>
      )}

      {f.sentiment_note && (
        <section className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <h3 className="text-sm font-semibold text-slate-800">
            How they get described
            <span className="ml-2 font-normal text-xs text-slate-500 uppercase">{f.sentiment}</span>
          </h3>
          <p className="text-xs text-slate-600 mt-1">{f.sentiment_note}</p>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-800">
          Every question asked, and what came back
        </h3>
        <div className="space-y-1.5">
          {scan.prompts?.map((row) => (
            <PromptRow key={row.id} row={row} />
          ))}
        </div>
      </section>

      <p className="text-[11px] text-slate-400 border-t border-slate-200 pt-3">
        Scanned by asking Claude with live web search &mdash; one assistant, not all of them.
        ChatGPT and Perplexity cite noticeably different sources, so treat this as a real but
        partial read. Run on {new Date(scan.created_at).toLocaleDateString()}.
      </p>
    </div>
  )
}
