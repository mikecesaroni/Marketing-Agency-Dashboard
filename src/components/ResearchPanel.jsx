import { useState } from 'react'
import Button from './ui/Button'
import { adLibraryUrl, competitorUrl, researchSearches } from '../lib/adResearch'

/**
 * Competitor research, through Meta's own Ad Library.
 *
 * THIS OPENS LINKS RATHER THAN PULLING ADS IN, and that is a finding, not a
 * shortcut. Meta's Ad Library API refuses this project's token for every
 * query and, even with the identity-verified personal token it wants, does not
 * return ordinary commercial ads in the US at all -- only political, housing,
 * employment and credit. The public Ad Library PAGE shows everything, to
 * anyone, so the panel builds the exact search a person would type and opens
 * it. The tools that do pull US commercial ads reverse-engineer Meta's private
 * API against its terms, which is not a thing to build into a company that is
 * meant to be sold.
 *
 * "Winning" here means "still running, and has been for a long time." The
 * Library shows no spend or results for a commercial ad. What it does show is
 * the start date, and nobody keeps paying for an ad that does not work -- so
 * an ad that has run for six months is the one to study.
 */
export default function ResearchPanel({ client, intake }) {
  const [competitor, setCompetitor] = useState('')

  const searches = researchSearches({
    industry: client.industry,
    market: client.market,
    fallbackTrade: intake?.industry_trade,
    fallbackArea: intake?.service_area,
  })
  const local = searches.filter((s) => s.scope === 'local')
  const national = searches.filter((s) => s.scope === 'national')

  const open = (url) => window.open(url, '_blank', 'noopener')

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">What the competition is running</p>
        <p className="mt-0.5 text-xs text-slate-600">
          Each button opens Meta&rsquo;s Ad Library on the exact search, showing every ad that is
          live right now with its creative and copy. Sort by <strong>oldest first</strong> once it
          opens: an ad that has been running for months is the one paying for itself.
        </p>
      </div>

      {searches.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          {client.name} has no trade or market on file, so there is nothing to search for yet. Fill
          in their industry and market on the client card, or the trade and service area on their
          onboarding form.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-700">Local competitors</p>
            <div className="flex flex-wrap gap-2">
              {local.map((s) => (
                <Button key={s.terms} size="sm" variant="outline" onClick={() => open(adLibraryUrl(s.terms))}>
                  {s.label} ↗
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-1 text-xs font-semibold text-slate-700">The trade, anywhere in the US</p>
            {/* The best creative is rarely local. A company doing this at scale
                in another state has already spent the money finding out what
                works, and the ad they have run for eight months is the answer. */}
            <p className="mb-2 text-[11px] text-slate-500">
              Where the best creative usually is. Somebody doing this at scale in another state has
              already paid to learn what works.
            </p>
            <div className="flex flex-wrap gap-2">
              {national.map((s) => (
                <Button key={s.terms} size="sm" variant="outline" onClick={() => open(adLibraryUrl(s.terms))}>
                  {s.label} ↗
                </Button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="rounded-lg border border-slate-200 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-700">A competitor by name</p>
        <div className="flex gap-2">
          <input
            value={competitor}
            onChange={(e) => setCompetitor(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && competitor.trim() && open(competitorUrl(competitor))}
            placeholder="e.g. Baker Brothers Plumbing"
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-xs"
          />
          <Button size="sm" variant="outline" disabled={!competitor.trim()} onClick={() => open(competitorUrl(competitor))}>
            Open ↗
          </Button>
        </div>
      </div>

      <p className="text-[11px] text-slate-500">
        The ads open on Meta, not here. Meta&rsquo;s API does not hand out ordinary business ads in
        the US to anyone, so there is no honest way to pull them into the CRM. What you see on that
        page is exactly what a customer sees.
      </p>
    </div>
  )
}
