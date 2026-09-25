import { useEffect, useState } from 'react'
import LocationPicker from './LocationPicker'
import FunnelBuilder from './FunnelBuilder'
import { SPECIAL_AD_CATEGORIES, ageFromIntake, locationsFromIntake } from '../lib/metaPublish'

/**
 * Build the top-of-funnel and retargeting pair from the client page, with no
 * creative involved.
 *
 * The builder first lived inside the publish flow, which sits inside the Ad
 * Studio, which is the creative tool -- so standing up the campaign skeleton
 * meant walking through media steps that have nothing to do with it. The
 * structure is supposed to exist BEFORE there is anything to put in it: build
 * it paused here, then publish creatives into the ad sets from the Studio
 * whenever they are ready. The two halves are separate jobs and now have
 * separate doors; the one inside publish stays for when you are already there.
 *
 * Locations come from the intake as SUGGESTIONS, never applied silently. Meta's
 * geo search matches names worldwide, so "Long Island" comes back as Maine
 * before New York; the publish panel learnt that the hard way and this keeps
 * the same rule.
 */
export default function FunnelPanel({ client, intake, initialOpen = false }) {
  // Opened straight away when Content → Publish → Build a funnel sent us.
  const [open, setOpen] = useState(initialOpen)
  const [locations, setLocations] = useState([])
  const [prefill, setPrefill] = useState(null)
  const [ageMin, setAgeMin] = useState(() => ageFromIntake(intake).min)
  const [ageMax, setAgeMax] = useState(() => ageFromIntake(intake).max)
  const [specialCategory, setSpecialCategory] = useState('')
  const [built, setBuilt] = useState(null)

  // Suggested locations, fetched once when the card is opened. Not applied.
  useEffect(() => {
    if (!open || !intake || prefill) return
    let cancelled = false
    locationsFromIntake(intake)
      .then((found) => !cancelled && found.entries.length > 0 && setPrefill(found))
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, intake])

  const addLocation = (c, radius) =>
    setLocations((prev) =>
      prev.some((l) => l.key === c.key)
        ? prev
        : [...prev, { ...c, radius: c.type === 'city' ? radius : undefined }]
    )

  if (!client?.meta_ad_account_id) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold text-slate-900">Funnel</h3>
        <p className="mt-1 text-sm text-slate-600">
          Connect this client&apos;s Meta ad account first. The funnel is built inside it.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">Funnel</h3>
          <p className="mt-0.5 text-sm text-slate-600">
            A cold campaign that excludes everyone already in the funnel, and a retargeting
            campaign that goes after them. Built paused, with no creative &mdash; publish ads
            into the ad sets from the Studio when they are ready.
          </p>
        </div>
        {!open && !built && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700"
          >
            Build a funnel &rarr;
          </button>
        )}
      </div>

      {built && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
          <p className="font-semibold">
            Built {built.campaigns?.length || 0} campaigns and {built.adsets?.length || 0} ad sets, all paused.
          </p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-green-800">
            {(built.adsets || []).map((a) => (
              <li key={a.id}>{a.name}</li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {built.ads_manager_url && (
              <a
                href={built.ads_manager_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800"
              >
                Open in Ads Manager &rarr;
              </a>
            )}
            <span className="text-[11px] text-green-800">
              Next: Ad Studio &rarr; Publish &rarr; &ldquo;Into an existing ad set&rdquo; and tick these.
            </span>
          </div>
        </div>
      )}

      {open && !built && (
        <div className="mt-3 space-y-3">
          {/* Where and who. The same three inputs the publish panel asks for,
              because the ad sets need them and there is no creative step here
              to have collected them already. */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Where it runs</p>
            {prefill && (
              <div className="text-[11px] text-slate-600">
                <p className="mb-1">From the onboarding form &mdash; click to add, nothing is added for you:</p>
                <ul className="space-y-1">
                  {prefill.entries.map((entry, i) => (
                    <li key={i}>
                      <span className="text-slate-500">{entry.query} &rarr;</span>
                      {entry.candidates.length === 0 ? (
                        <span className="text-slate-400">no match, add it by hand</span>
                      ) : (
                        <span className="inline-flex flex-wrap gap-1">
                          {entry.candidates.map((c) => {
                            const already = locations.some((l) => l.key === c.key)
                            return (
                              <button
                                key={c.key}
                                type="button"
                                disabled={already}
                                onClick={() => addLocation(c, entry.radius)}
                                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                                  already
                                    ? 'border-slate-200 bg-slate-100 text-slate-400'
                                    : 'border-slate-300 bg-white text-slate-700 hover:border-orange-400 hover:bg-orange-50'
                                }`}
                              >
                                {already ? '✓ ' : '+ '}
                                {c.label}
                              </button>
                            )
                          })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <LocationPicker picked={locations} onChange={setLocations} />

            <div className="grid gap-2 md:grid-cols-3">
              <label className="text-xs">
                <span className="block font-medium text-slate-700">Age from</span>
                <input
                  value={ageMin}
                  onChange={(e) => setAgeMin(e.target.value)}
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                <span className="block font-medium text-slate-700">Age to</span>
                <input
                  value={ageMax}
                  onChange={(e) => setAgeMax(e.target.value)}
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs">
                <span className="block font-medium text-slate-700">Special ad category</span>
                <select
                  value={specialCategory}
                  onChange={(e) => setSpecialCategory(e.target.value)}
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                >
                  {SPECIAL_AD_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <FunnelBuilder
            client={client}
            locations={locations}
            ageMin={ageMin}
            ageMax={ageMax}
            specialCategory={specialCategory}
            onCancel={() => setOpen(false)}
            onBuilt={(result) => {
              setBuilt(result)
              setOpen(false)
            }}
          />
        </div>
      )}
    </div>
  )
}
