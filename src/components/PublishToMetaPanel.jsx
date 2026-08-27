import { useEffect, useMemo, useState } from 'react'
import LocationPicker from './LocationPicker'
import {
  CTA_OPTIONS,
  OBJECTIVES,
  SPECIAL_AD_CATEGORIES,
  dollarsToCents,
  listCampaigns,
  publishAd,
  summarisePlan,
} from '../lib/metaPublish'

function Section({ step, title, hint, children }) {
  return (
    <section className="space-y-2">
      <div>
        <h4 className="text-sm font-semibold text-slate-800">
          <span className="text-slate-400 font-normal mr-1.5">{step}</span>
          {title}
        </h4>
        {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function Text({ label, value, onChange, placeholder, hint }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}
        {hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
      />
    </div>
  )
}

/**
 * Everything Meta needs that the CRM has no value for yet.
 *
 * Shown before the form rather than as a failure after the button: the Page ID
 * in particular has never been asked for anywhere in this app, so without this
 * the first publish would be a rejected creative and a confusing error.
 */
function Preflight({ missing }) {
  if (missing.length === 0) return null
  return (
    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <p className="text-sm font-medium text-amber-900">
        Not ready to publish yet — {missing.length} thing{missing.length > 1 ? 's' : ''} missing
      </p>
      <ul className="mt-1.5 space-y-1">
        {missing.map((m) => (
          <li key={m.field} className="text-xs text-amber-800">
            <span className="font-medium">{m.label}</span> — {m.why}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-amber-700 mt-2">
        Set these on the client&rsquo;s Meta card, then come back.
      </p>
    </div>
  )
}

// The result of a successful publish. The deep link matters more than the IDs:
// the whole design is that a human finishes the job in Ads Manager.
function Published({ result, onAnother }) {
  return (
    <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
      <div>
        <p className="text-sm font-semibold text-green-900">Created in Meta — paused</p>
        <p className="text-xs text-green-800 mt-1">
          The campaign, ad set and ad all exist and are switched off. Nothing is spending. Open Ads
          Manager, check it over, and set it live there.
        </p>
      </div>

      <a
        href={result.ads_manager_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 transition"
      >
        Open in Ads Manager →
      </a>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-green-900/80 pt-1">
        {[
          ['Campaign', result.campaign_id],
          ['Ad set', result.adset_id],
          ['Creative', result.creative_id],
          ['Ad', result.ad_id],
        ].map(([label, id]) => (
          <div key={label} className="flex gap-1.5">
            <dt className="font-medium">{label}</dt>
            <dd className="font-mono truncate">{id}</dd>
          </div>
        ))}
      </dl>

      {result.recorded === false && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          The ad was created, but the CRM could not record it. Run supabase/meta-publish.sql if the
          published_ads table is missing — the ad itself is fine.
        </p>
      )}

      <button onClick={onAnother} className="text-xs text-green-800 underline hover:text-green-900">
        Publish another size
      </button>
    </div>
  )
}

// A publish that died partway leaves paused objects behind. Deleting them
// automatically would be a destructive write on a failure path, so they are
// named instead and the human decides.
function PartialWarning({ partial }) {
  if (!partial) return null
  const rows = Object.entries(partial).filter(([, v]) => v)
  if (rows.length === 0) return null
  return (
    <div className="mt-2 pt-2 border-t border-red-200">
      <p className="text-xs font-medium text-red-800">
        These were created before it failed, and are sitting paused in the account:
      </p>
      <ul className="mt-1 text-[11px] font-mono text-red-700">
        {rows.map(([k, v]) => (
          <li key={k}>
            {k.replace(/_/g, ' ')}: {v}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-red-700 mt-1">
        Nothing is spending. Delete them in Ads Manager, or pick the campaign above to reuse it on
        the next attempt.
      </p>
    </div>
  )
}

/**
 * Sends one saved creative to Meta as a real, paused ad.
 *
 * Publishes from a SAVED ad rather than whatever is on the Design tab, because
 * Meta has to fetch image bytes from somewhere: the public bucket URL only
 * exists once the artboards have been saved.
 */
export default function PublishToMetaPanel({ client, set, alreadyPublished = [], onPublished }) {
  const recipe = set.recipe || {}

  // Portrait is the default: it is the tallest thing that still runs in feed,
  // so it takes the most screen without being a Stories-only asset.
  const [sizeKey, setSizeKey] = useState(
    set.ordered.find((o) => o.size.key === 'feed')?.size.key || set.ordered[0]?.size.key || ''
  )

  const [primaryText, setPrimaryText] = useState(recipe.primary_text || '')
  const [headline, setHeadline] = useState(recipe.headline || recipe.hook || '')
  const [description, setDescription] = useState(recipe.description || '')
  const [cta, setCta] = useState('LEARN_MORE')
  const [linkUrl, setLinkUrl] = useState(client.website_url || '')

  const [objective, setObjective] = useState('OUTCOME_TRAFFIC')
  const [specialCategory, setSpecialCategory] = useState('')

  const [reuseCampaign, setReuseCampaign] = useState(false)
  const [campaigns, setCampaigns] = useState(null)
  const [campaignId, setCampaignId] = useState('')
  const [campaignName, setCampaignName] = useState(`${client.name} — ${new Date().getFullYear()}`)

  const [adsetName, setAdsetName] = useState('')
  const [dailyBudget, setDailyBudget] = useState('20')
  const [ageMin, setAgeMin] = useState(25)
  const [ageMax, setAgeMax] = useState(65)
  const [locations, setLocations] = useState([])

  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const [partial, setPartial] = useState(null)
  const [result, setResult] = useState(null)

  const chosenObjective = OBJECTIVES.find((o) => o.value === objective)

  // Things Meta requires that this CRM may never have been told.
  const missing = useMemo(() => {
    const gaps = []
    if (!client.meta_ad_account_id) {
      gaps.push({
        field: 'meta_ad_account_id',
        label: 'Ad account',
        why: 'there is nowhere to create the ad',
      })
    }
    if (!client.meta_page_id) {
      gaps.push({
        field: 'meta_page_id',
        label: 'Facebook Page ID',
        why: 'an ad creative is a Page post, so Meta rejects one without it',
      })
    }
    if (chosenObjective?.needsPixel && !client.meta_pixel_id) {
      gaps.push({
        field: 'meta_pixel_id',
        label: 'Pixel ID',
        why: 'optimising for leads means chasing a conversion event, and the pixel is what reports it',
      })
    }
    return gaps
  }, [client, chosenObjective])

  // Lazily: this is a live call to Meta, not worth making unless the existing
  // campaigns are actually being looked at.
  useEffect(() => {
    if (!reuseCampaign || campaigns !== null) return
    listCampaigns(client.id)
      .then((found) => {
        setCampaigns(found)
        if (found.length > 0) setCampaignId(found[0].id)
      })
      .catch((err) => {
        setError(err.message)
        setCampaigns([])
      })
  }, [reuseCampaign, campaigns, client.id])

  const chosen = set.ordered.find((o) => o.size.key === sizeKey)
  const chosenCampaign = reuseCampaign ? campaigns?.find((c) => c.id === campaignId) : null
  const budgetCents = dollarsToCents(dailyBudget)

  const publishedThisSize = alreadyPublished.filter(
    (p) => p.stamp === set.stamp && p.size_key === sizeKey
  )

  const blockers = []
  if (missing.length > 0) blockers.push('missing client details')
  if (!chosen) blockers.push('no image picked')
  if (!primaryText.trim()) blockers.push('no primary text')
  if (!linkUrl.trim()) blockers.push('no landing page')
  if (locations.length === 0) blockers.push('no locations')
  if (budgetCents < 100) blockers.push('budget under $1.00')
  if (reuseCampaign && !campaignId) blockers.push('no campaign picked')
  if (chosenCampaign?.campaign_budget) blockers.push('that campaign sets its own budget')

  const submit = async () => {
    setPublishing(true)
    setError('')
    setPartial(null)
    try {
      const data = await publishAd({
        client_id: client.id,
        image_url: chosen.file.url,
        stamp: set.stamp,
        size_key: sizeKey,
        objective,
        special_ad_categories: specialCategory ? [specialCategory] : [],
        campaign_id: reuseCampaign ? campaignId : undefined,
        campaign_name: reuseCampaign ? undefined : campaignName.trim(),
        adset_name: adsetName.trim() || undefined,
        ad_name: `${client.name} — ${recipe.hook || 'ad'}`.slice(0, 100),
        daily_budget_cents: budgetCents,
        locations,
        age_min: Number(ageMin),
        age_max: Number(ageMax),
        primary_text: primaryText.trim(),
        headline: headline.trim() || undefined,
        description: description.trim() || undefined,
        cta,
        link_url: linkUrl.trim(),
      })
      setResult(data)
      onPublished?.()
    } catch (err) {
      setError(err.message)
      setPartial(err.partial || null)
    } finally {
      setPublishing(false)
    }
  }

  if (result) return <Published result={result} onAnother={() => setResult(null)} />

  return (
    <div className="space-y-5">
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
        <p className="text-xs text-slate-700">
          <span className="font-medium">Everything below is created paused.</span> This builds the
          campaign, ad set and ad in {client.name}&rsquo;s account and stops. Switching it on is a
          separate, deliberate click in Ads Manager.
        </p>
      </div>

      <Preflight missing={missing} />

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
          <PartialWarning partial={partial} />
        </div>
      )}

      <Section step="1" title="Which image" hint="One ad, one image. Publish again for another size.">
        <div className="flex gap-3 overflow-x-auto pb-1">
          {set.ordered.map(({ size, file }) => (
            <button
              key={size.key}
              onClick={() => setSizeKey(size.key)}
              className={`flex-shrink-0 p-1.5 rounded-lg border-2 transition ${
                sizeKey === size.key
                  ? 'border-orange-600 bg-orange-50'
                  : 'border-transparent hover:border-slate-300'
              }`}
            >
              <img
                src={file.url}
                alt={size.label}
                loading="lazy"
                className="border border-slate-300 rounded bg-slate-100 object-cover"
                style={{ width: size.w / 9, height: size.h / 9 }}
              />
              <p className="text-[11px] text-slate-600 mt-1">{size.label}</p>
            </button>
          ))}
        </div>
        {publishedThisSize.length > 0 && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            This size was already published{' '}
            {publishedThisSize.length > 1 ? `${publishedThisSize.length} times` : 'once'} — most
            recently {new Date(publishedThisSize[0].created_at).toLocaleDateString()}. Publishing
            again creates a second ad.
          </p>
        )}
      </Section>

      <Section
        step="2"
        title="The copy that is not on the image"
        hint="Primary text sits above the image in the feed; the headline sits under it, next to the button."
      >
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Primary text</label>
          <textarea
            value={primaryText}
            onChange={(e) => setPrimaryText(e.target.value)}
            rows={4}
            placeholder="The copy above the image…"
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
          />
        </div>
        <div className="grid md:grid-cols-2 gap-2">
          <Text label="Headline" value={headline} onChange={setHeadline} hint="under the image" />
          <Text
            label="Description"
            value={description}
            onChange={setDescription}
            hint="optional, often hidden"
          />
        </div>
        <div className="grid md:grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Button</label>
            <select
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
            >
              {CTA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <Text
            label="Landing page"
            value={linkUrl}
            onChange={setLinkUrl}
            placeholder="https://…"
            hint={client.website_url ? 'from the client' : 'not set on the client'}
          />
        </div>
      </Section>

      <Section step="3" title="Objective">
        <div className="grid md:grid-cols-2 gap-2">
          {OBJECTIVES.map((o) => (
            <button
              key={o.value}
              onClick={() => setObjective(o.value)}
              className={`text-left p-3 rounded-lg border-2 transition ${
                objective === o.value
                  ? 'border-orange-600 bg-orange-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className="text-sm font-medium text-slate-900">{o.label}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{o.hint}</p>
            </button>
          ))}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Special ad category
            <span className="ml-1 font-normal text-slate-400">
              Meta requires this on every campaign
            </span>
          </label>
          <select
            value={specialCategory}
            onChange={(e) => setSpecialCategory(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
          >
            {SPECIAL_AD_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Declaring the wrong one is a policy problem, not an error message. Home services is
            None.
          </p>
        </div>
      </Section>

      <Section
        step="4"
        title="Campaign"
        hint="Reusing a campaign keeps its learning; a new one starts cold."
      >
        <div className="flex gap-1">
          {[
            [false, 'New campaign'],
            [true, 'Add to an existing one'],
          ].map(([value, label]) => (
            <button
              key={String(value)}
              onClick={() => setReuseCampaign(value)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                reuseCampaign === value
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {reuseCampaign ? (
          campaigns === null ? (
            <p className="text-xs text-slate-500">Loading campaigns from Meta…</p>
          ) : campaigns.length === 0 ? (
            <p className="text-xs text-slate-500">
              No campaigns in this account yet. Create a new one instead.
            </p>
          ) : (
            <>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.objective} ({c.effective_status || c.status})
                    {c.campaign_budget ? ' — holds its own budget' : ''}
                  </option>
                ))}
              </select>
              {chosenCampaign?.campaign_budget && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  This campaign sets the budget itself, so Meta will reject an ad set that brings
                  its own. Pick a different campaign, or create a new one.
                </p>
              )}
              {chosenCampaign && chosenCampaign.objective !== objective && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  The campaign&rsquo;s objective is {chosenCampaign.objective}, which wins over the{' '}
                  {chosenObjective?.label} picked above — objectives are set per campaign, not per
                  ad set.
                </p>
              )}
            </>
          )
        ) : (
          <Text label="Campaign name" value={campaignName} onChange={setCampaignName} />
        )}
      </Section>

      <Section step="5" title="Ad set" hint="Budget, who sees it, and where.">
        <div className="grid md:grid-cols-2 gap-2">
          <Text
            label="Ad set name"
            value={adsetName}
            onChange={setAdsetName}
            placeholder={`${client.name} — ${new Date().toISOString().slice(0, 10)}`}
            hint="optional"
          />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Daily budget <span className="font-normal text-slate-400">US dollars</span>
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-slate-500">$</span>
              <input
                value={dailyBudget}
                onChange={(e) => setDailyBudget(e.target.value)}
                inputMode="decimal"
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
              />
              <span className="text-xs text-slate-400 whitespace-nowrap">/ day</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">Age</label>
          <input
            type="number"
            min={18}
            max={65}
            value={ageMin}
            onChange={(e) => setAgeMin(e.target.value)}
            className="w-16 px-2 py-1.5 border border-slate-300 rounded text-sm"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="number"
            min={18}
            max={65}
            value={ageMax}
            onChange={(e) => setAgeMax(e.target.value)}
            className="w-16 px-2 py-1.5 border border-slate-300 rounded text-sm"
          />
          <span className="text-[11px] text-slate-400">65 means 65+</span>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Locations</label>
          <LocationPicker picked={locations} onChange={setLocations} />
        </div>
      </Section>

      <div className="pt-3 border-t border-slate-200 space-y-2">
        <p className="text-xs text-slate-600">
          {summarisePlan({ objective, dailyBudget, locations, campaignName, reuseCampaign })}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={publishing || blockers.length > 0}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 transition"
          >
            {publishing ? 'Creating in Meta…' : 'Publish paused to Meta'}
          </button>
          {blockers.length > 0 && (
            <p className="text-[11px] text-slate-500">Still needed: {blockers.join(', ')}.</p>
          )}
        </div>
      </div>
    </div>
  )
}
