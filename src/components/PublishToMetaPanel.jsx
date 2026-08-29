import { useEffect, useMemo, useState } from 'react'
import LocationPicker from './LocationPicker'
import LeadFormPicker from './LeadFormPicker'
import { fetchSavedAds } from '../lib/savedAds'
import {
  CTA_OPTIONS,
  MAX_BATCH_ADS,
  OBJECTIVES,
  SPECIAL_AD_CATEGORIES,
  dollarsToCents,
  imagesFromSet,
  listAdsets,
  listCampaigns,
  publishAd,
  publishAdBatch,
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

function Toggle({ value, onChange, options }) {
  return (
    <div className="flex gap-1">
      {options.map(([val, label]) => (
        <button
          key={String(val)}
          onClick={() => onChange(val)}
          className={`px-3 py-1.5 rounded text-xs font-medium transition ${
            value === val
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
          }`}
        >
          {label}
        </button>
      ))}
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
  // A batch reports per ad; a single publish reports one set of IDs. Normalised
  // so the screen below does not have to know which it was.
  const rows = result.results || [
    { ok: true, ad_name: null, creative_id: result.creative_id, ad_id: result.ad_id },
  ]
  const good = rows.filter((r) => r.ok)
  const bad = rows.filter((r) => !r.ok)

  return (
    <div
      className={`p-4 rounded-lg space-y-3 border ${
        bad.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
      }`}
    >
      <div>
        <p className="text-sm font-semibold text-green-900">
          {good.length === 1 ? 'Created in Meta — paused' : `${good.length} ads created in Meta — paused`}
        </p>
        <p className="text-xs text-green-800 mt-1">
          {result.reused_adset ? (
            <>
              {good.length === 1 ? 'The ad is' : 'The ads are'} inside the ad set you picked, switched
              off.{' '}
              {result.adset_live
                ? 'That ad set is already delivering, so switching one on starts it spending immediately.'
                : 'The ad set itself is still paused too.'}
            </>
          ) : (
            <>
              The campaign, ad set and {good.length === 1 ? 'ad' : 'ads'} all exist and are switched
              off. Nothing is spending. Open Ads Manager, check it over, and set it live there.
            </>
          )}
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

      {bad.length > 0 && (
        <div className="p-2 bg-white border border-amber-300 rounded">
          <p className="text-xs font-medium text-amber-900">
            {bad.length} of {rows.length} did not publish:
          </p>
          <ul className="mt-1 space-y-1">
            {bad.map((r, i) => (
              <li key={i} className="text-[11px] text-amber-800">
                <span className="font-medium">{r.ad_name || `Ad ${i + 1}`}</span> — {r.error}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-amber-700 mt-1">
            The ones above are the only ones missing. Publish them again into the same ad set rather
            than re-running the whole batch.
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-green-900/80 pt-1">
        <div className="flex gap-1.5">
          <dt className="font-medium">Campaign</dt>
          <dd className="font-mono truncate">{result.campaign_id}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="font-medium">Ad set</dt>
          <dd className="font-mono truncate">{result.adset_id}</dd>
        </div>
        {good.map((r, i) => (
          <div key={r.ad_id || i} className="flex gap-1.5">
            <dt className="font-medium">{r.ad_name || 'Ad'}</dt>
            <dd className="font-mono truncate">{r.ad_id}</dd>
          </div>
        ))}
      </dl>

      {(result.needs_instagram || rows.some((r) => r.needs_instagram)) && (
        <div className="p-2 bg-white border border-amber-300 rounded">
          <p className="text-xs font-medium text-amber-900">
            Published with one image instead of a crop per placement
          </p>
          <p className="text-[11px] text-amber-800 mt-1">
            Serving a different crop to Stories and to feed makes the ad represent the business on
            Instagram, and Meta will not do that without an Instagram account connected to this
            client&rsquo;s Page or ad account. The 4:5 image went out everywhere instead. Connect an
            Instagram account in Business Settings and the next publish will use all three sizes on
            its own — nothing here needs changing.
          </p>
        </div>
      )}

      {result.recorded === false && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          The ads were created, but the CRM could not record them. Run supabase/meta-publish.sql if
          the published_ads table is missing — the ads themselves are fine.
        </p>
      )}

      <button onClick={onAnother} className="text-xs text-green-800 underline hover:text-green-900">
        Publish more into this ad set
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
 * One creative in the picker: tick it to include it, and edit the copy that
 * goes with it.
 *
 * The copy lives per creative rather than once for the publish. Four statics in
 * a launch are four different hooks, and making them share one primary text
 * would defeat the point of running them against each other.
 */
function CreativeRow({ set, checked, onToggle, copy, onCopy, publishedBefore, open, onOpen }) {
  const thumb = set.ordered[0]?.file?.url
  const sizes = set.ordered.map((o) => o.size.key)

  return (
    <li className={`border rounded-lg transition ${checked ? 'border-orange-400 bg-orange-50/40' : 'border-slate-200'}`}>
      <div className="flex items-start gap-3 p-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1 flex-shrink-0 accent-orange-600"
        />
        {thumb && (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="w-12 h-12 object-cover rounded border border-slate-300 flex-shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-800 truncate">
            {copy.ad_name || set.recipe?.hook || new Date(Number(set.stamp)).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500">
            {sizes.length} size{sizes.length === 1 ? '' : 's'} — {sizes.join(', ')}
            {sizes.length > 1 && ' — one ad, split by placement'}
          </p>
          {publishedBefore > 0 && (
            <p className="text-[11px] text-amber-700">
              Already published {publishedBefore === 1 ? 'once' : `${publishedBefore} times`}
            </p>
          )}
          {checked && !copy.primary_text && (
            <p className="text-[11px] text-red-600">Needs primary text</p>
          )}
        </div>
        {checked && (
          <button
            type="button"
            onClick={onOpen}
            className="text-[11px] text-slate-600 underline hover:text-slate-900 flex-shrink-0"
          >
            {open ? 'Hide copy' : 'Edit copy'}
          </button>
        )}
      </div>

      {checked && open && (
        <div className="px-2 pb-2 space-y-2 border-t border-slate-200 pt-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Primary text</label>
            <textarea
              value={copy.primary_text}
              onChange={(e) => onCopy({ primary_text: e.target.value })}
              rows={3}
              placeholder="The copy above the image…"
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
            />
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            <Text
              label="Headline"
              value={copy.headline}
              onChange={(v) => onCopy({ headline: v })}
              hint="under the image"
            />
            <Text
              label="Description"
              value={copy.description}
              onChange={(v) => onCopy({ description: v })}
              hint="optional"
            />
          </div>
          <Text
            label="Ad name"
            value={copy.ad_name}
            onChange={(v) => onCopy({ ad_name: v })}
            hint="what you will see in Ads Manager"
          />
        </div>
      )}
    </li>
  )
}

/**
 * Sends saved creatives to Meta as real, paused ads.
 *
 * Publishes from SAVED ads rather than whatever is on the Design tab, because
 * Meta has to fetch image bytes from somewhere: the public bucket URL only
 * exists once the artboards have been saved.
 *
 * Two things it does that are worth knowing about:
 *
 *   * Every size of one creative goes into ONE ad, mapped to the placements it
 *     was drawn for. Publishing per size made three ads that competed with each
 *     other for the same impressions.
 *   * Several creatives go into ONE ad set. A launch is four hooks tested
 *     against each other, and that test only means anything inside a single ad
 *     set — four ad sets is four auctions and a quarter of the data each.
 */
export default function PublishToMetaPanel({ client, set, alreadyPublished = [], onPublished }) {
  // Every saved creative for this client, so a launch can pick several without
  // going back to the gallery one at a time. The set that opened this panel is
  // the one that starts ticked.
  const [sets, setSets] = useState([set])
  const [picked, setPicked] = useState([String(set.stamp)])
  const [copies, setCopies] = useState({})
  const [openCopy, setOpenCopy] = useState(String(set.stamp))

  const [cta, setCta] = useState('LEARN_MORE')
  const [linkUrl, setLinkUrl] = useState(client.website_url || '')

  // Instant form is the default: no landing page to build, and Meta prefills
  // the fields, so it is both less setup and a better mobile conversion rate.
  const [objective, setObjective] = useState('LEADS_FORM')
  const [leadForm, setLeadForm] = useState(null)
  const [specialCategory, setSpecialCategory] = useState('')

  const [reuseCampaign, setReuseCampaign] = useState(false)
  const [campaigns, setCampaigns] = useState(null)
  const [campaignId, setCampaignId] = useState('')
  const [campaignName, setCampaignName] = useState(`${client.name} — ${new Date().getFullYear()}`)

  const [reuseAdset, setReuseAdset] = useState(false)
  const [adsets, setAdsets] = useState(null)
  const [adsetId, setAdsetId] = useState('')

  const [adsetName, setAdsetName] = useState('')
  const [dailyBudget, setDailyBudget] = useState('20')
  const [ageMin, setAgeMin] = useState(25)
  const [ageMax, setAgeMax] = useState(65)
  const [locations, setLocations] = useState([])

  const [publishing, setPublishing] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [partial, setPartial] = useState(null)
  const [result, setResult] = useState(null)

  const chosenObjective = OBJECTIVES.find((o) => o.value === objective)

  // The rest of the client's saved ads. Best effort — the set that opened the
  // panel is already here, so a failure costs the extra choices, not the page.
  useEffect(() => {
    fetchSavedAds(client.id)
      .then((all) => {
        if (all.length > 0) setSets(all)
      })
      .catch(() => {})
  }, [client.id])

  // Seed each creative's copy from its own saved recipe. Only for stamps not
  // already edited, so re-running this never overwrites typing.
  useEffect(() => {
    setCopies((prev) => {
      const next = { ...prev }
      for (const s of sets) {
        const key = String(s.stamp)
        if (next[key]) continue
        const r = s.recipe || {}
        next[key] = {
          primary_text: r.primary_text || '',
          headline: r.headline || r.hook || '',
          description: r.description || '',
          ad_name: `${client.name} — ${r.hook || 'ad'}`.slice(0, 100),
        }
      }
      return next
    })
  }, [sets, client.name])

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

  // Switching objective can strand a form on an ad that no longer uses one.
  useEffect(() => {
    if (!chosenObjective?.needsForm) setLeadForm(null)
  }, [chosenObjective?.needsForm])

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

  // An ad set belongs to exactly one campaign, so the list follows whichever
  // campaign is picked and is thrown away when that changes.
  useEffect(() => {
    setAdsets(null)
    setAdsetId('')
  }, [campaignId])

  useEffect(() => {
    if (!reuseCampaign || !reuseAdset || !campaignId || adsets !== null) return
    listAdsets(client.id, campaignId)
      .then((found) => {
        setAdsets(found)
        if (found.length > 0) setAdsetId(found[0].id)
      })
      .catch((err) => {
        setError(err.message)
        setAdsets([])
      })
  }, [reuseCampaign, reuseAdset, campaignId, adsets, client.id])

  // Reusing an ad set only makes sense inside a campaign that already exists.
  useEffect(() => {
    if (!reuseCampaign) setReuseAdset(false)
  }, [reuseCampaign])

  const chosenCampaign = reuseCampaign ? campaigns?.find((c) => c.id === campaignId) : null
  const chosenAdset = reuseAdset ? adsets?.find((a) => a.id === adsetId) : null
  const budgetCents = dollarsToCents(dailyBudget)

  const pickedSets = sets.filter((s) => picked.includes(String(s.stamp)))
  const maxSizes = Math.max(1, ...pickedSets.map((s) => s.ordered.length))

  const togglePick = (stamp) =>
    setPicked((prev) =>
      prev.includes(stamp) ? prev.filter((s) => s !== stamp) : [...prev, stamp]
    )

  const blockers = []
  if (missing.length > 0) blockers.push('missing client details')
  if (pickedSets.length === 0) blockers.push('no creative picked')
  if (pickedSets.length > MAX_BATCH_ADS) blockers.push(`more than ${MAX_BATCH_ADS} creatives`)
  if (pickedSets.some((s) => !copies[String(s.stamp)]?.primary_text?.trim()))
    blockers.push('a creative has no primary text')
  if (chosenObjective?.needsLink && !linkUrl.trim()) blockers.push('no landing page')
  if (chosenObjective?.needsForm && !leadForm) blockers.push('no instant form picked')
  if (reuseCampaign && !campaignId) blockers.push('no campaign picked')
  if (reuseAdset && !adsetId) blockers.push('no ad set picked')
  if (chosenCampaign?.campaign_budget && !reuseAdset)
    blockers.push('that campaign sets its own budget')
  // Budget and targeting belong to the ad set. When one is being reused they
  // are already set on it and are not asked for here.
  if (!reuseAdset) {
    if (locations.length === 0) blockers.push('no locations')
    if (budgetCents < 100) blockers.push('budget under $1.00')
  }

  const submit = async () => {
    setPublishing(true)
    setError('')
    setPartial(null)
    setProgress(
      pickedSets.length === 1
        ? 'Uploading the image and creating the ad…'
        : `Creating ${pickedSets.length} ads in one ad set…`
    )
    try {
      const ads = pickedSets.map((s) => {
        const c = copies[String(s.stamp)] || {}
        return {
          stamp: s.stamp,
          // Every artboard this creative saved, so one ad serves the right one
          // per placement instead of three ads competing.
          images: imagesFromSet(s),
          primary_text: c.primary_text?.trim(),
          headline: c.headline?.trim() || undefined,
          description: c.description?.trim() || undefined,
          ad_name: c.ad_name?.trim() || undefined,
          cta,
          link_url: linkUrl.trim() || undefined,
          lead_form_id: leadForm?.id,
          lead_form_name: leadForm?.name,
        }
      })

      const shared = {
        client_id: client.id,
        objective,
        special_ad_categories: specialCategory ? [specialCategory] : [],
        campaign_id: reuseCampaign ? campaignId : undefined,
        campaign_name: reuseCampaign ? undefined : campaignName.trim(),
        adset_id: reuseAdset ? adsetId : undefined,
        adset_name: reuseAdset ? undefined : adsetName.trim() || undefined,
        daily_budget_cents: reuseAdset ? undefined : budgetCents,
        locations: reuseAdset ? [] : locations,
        age_min: Number(ageMin),
        age_max: Number(ageMax),
      }

      // One creative still goes through the single-ad action, which keeps the
      // long-standing response shape and its error handling intact.
      const data =
        ads.length === 1
          ? await publishAd({ ...shared, ...ads[0] })
          : await publishAdBatch({ ads, ...shared })

      setResult(data)
      onPublished?.()
    } catch (err) {
      setError(err.message)
      setPartial(err.partial || null)
    } finally {
      setPublishing(false)
      setProgress('')
    }
  }

  if (result) {
    return (
      <Published
        result={result}
        onAnother={() => {
          // Straight back into the same ad set: the point of publishing more is
          // usually to add to what was just made, not to build a second one.
          if (result.adset_id) {
            setReuseCampaign(true)
            setCampaignId(result.campaign_id || '')
            setReuseAdset(true)
            setAdsets(null)
            setAdsetId(result.adset_id)
          }
          setPicked([])
          setResult(null)
        }}
      />
    )
  }

  const step = (n) => (chosenObjective?.needsForm ? n : n - 1)

  return (
    <div className="space-y-5">
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
        <p className="text-xs text-slate-700">
          <span className="font-medium">Everything below is created paused.</span> This builds the
          ads in {client.name}&rsquo;s account and stops. Switching them on is a separate,
          deliberate click in Ads Manager.
        </p>
      </div>

      <Preflight missing={missing} />

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
          <PartialWarning partial={partial} />
        </div>
      )}

      <Section
        step="1"
        title="Which creatives"
        hint="Tick everything going into this launch. They all land in one ad set, which is the only way testing them against each other means anything."
      >
        <ul className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          {sets.map((s) => {
            const stamp = String(s.stamp)
            return (
              <CreativeRow
                key={stamp}
                set={s}
                checked={picked.includes(stamp)}
                onToggle={() => togglePick(stamp)}
                copy={copies[stamp] || { primary_text: '', headline: '', description: '', ad_name: '' }}
                onCopy={(patch) =>
                  setCopies((prev) => ({ ...prev, [stamp]: { ...prev[stamp], ...patch } }))
                }
                publishedBefore={alreadyPublished.filter((p) => p.stamp === stamp).length}
                open={openCopy === stamp}
                onOpen={() => setOpenCopy(openCopy === stamp ? '' : stamp)}
              />
            )
          })}
        </ul>
        {pickedSets.length > MAX_BATCH_ADS && (
          <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
            {pickedSets.length} creatives is more than one publish will take. Send{' '}
            {MAX_BATCH_ADS} now and the rest into the same ad set afterwards.
          </p>
        )}
        {maxSizes > 1 && (
          <p className="text-[11px] text-slate-500">
            Each creative publishes as <strong>one ad</strong> holding all {maxSizes} of its sizes —
            the 9:16 goes to Stories and Reels, the 1:1 to right column, Marketplace and search, and
            the 4:5 everywhere else.
          </p>
        )}
      </Section>

      <Section step="2" title="Button and destination" hint="Shared by every ad in this publish.">
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
          {chosenObjective?.needsLink ? (
            <Text
              label="Landing page"
              value={linkUrl}
              onChange={setLinkUrl}
              placeholder="https://…"
              hint={client.website_url ? 'from the client' : 'not set on the client'}
            />
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Destination</label>
              <p className="px-3 py-2 border border-dashed border-slate-300 rounded text-sm text-slate-500">
                The instant form — no landing page
              </p>
            </div>
          )}
        </div>
      </Section>

      <Section step="3" title="Objective">
        {reuseAdset && chosenAdset ? (
          <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2">
            Set by the ad set you picked, not here — objectives belong to the campaign. Meta reads it
            back as <strong>{OBJECTIVES.find((o) => o.value === chosenAdset.objective)?.label || chosenAdset.objective}</strong>.
          </p>
        ) : (
          <>
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
          </>
        )}
      </Section>

      {chosenObjective?.needsForm && (
        <Section
          step="4"
          title="The instant form"
          hint="Where the leads actually land. Reuse one where you can — a form owns its leads."
        >
          <LeadFormPicker client={client} value={leadForm} onChange={setLeadForm} />
        </Section>
      )}

      <Section
        step={String(step(5))}
        title="Campaign"
        hint="Reusing a campaign keeps its learning; a new one starts cold."
      >
        <Toggle
          value={reuseCampaign}
          onChange={setReuseCampaign}
          options={[
            [false, 'New campaign'],
            [true, 'Add to an existing one'],
          ]}
        />

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
              {chosenCampaign?.campaign_budget && !reuseAdset && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  This campaign sets the budget itself, so Meta will reject a new ad set that brings
                  its own. Pick one of its existing ad sets below, or choose a different campaign.
                </p>
              )}
              {chosenCampaign && !reuseAdset && chosenCampaign.objective !== objective && (
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

      <Section
        step={String(step(6))}
        title="Ad set"
        hint={
          reuseCampaign
            ? 'Budget, who sees it, and where — or drop these ads into an ad set that already has all that.'
            : 'Budget, who sees it, and where.'
        }
      >
        {reuseCampaign && (
          <Toggle
            value={reuseAdset}
            onChange={setReuseAdset}
            options={[
              [false, 'New ad set'],
              [true, 'Into an existing ad set'],
            ]}
          />
        )}

        {reuseAdset ? (
          adsets === null ? (
            <p className="text-xs text-slate-500">Loading ad sets from Meta…</p>
          ) : adsets.length === 0 ? (
            <p className="text-xs text-slate-500">
              That campaign has no ad sets yet. Create a new one instead.
            </p>
          ) : (
            <>
              <select
                value={adsetId}
                onChange={(e) => setAdsetId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
              >
                {adsets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.daily_budget ? ` — $${(Number(a.daily_budget) / 100).toFixed(2)}/day` : ''} (
                    {a.effective_status || a.status})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                Its budget, targeting and schedule stay exactly as they are — this only adds ads
                inside it.
              </p>
              {chosenAdset?.live && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  This ad set is delivering right now. The new ads arrive paused, but switching one
                  on puts it into a live auction immediately.
                </p>
              )}
            </>
          )
        ) : (
          <>
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
          </>
        )}
      </Section>

      <div className="pt-3 border-t border-slate-200 space-y-2">
        <p className="text-xs text-slate-600">
          {summarisePlan({
            objective,
            dailyBudget,
            locations,
            campaignName,
            reuseCampaign,
            formName: leadForm?.name,
            adCount: pickedSets.length,
            sizeCount: maxSizes,
            reuseAdset: chosenAdset,
          })}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={publishing || blockers.length > 0}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 transition"
          >
            {publishing
              ? 'Creating in Meta…'
              : `Publish ${pickedSets.length || ''} paused to Meta`.replace('  ', ' ')}
          </button>
          {publishing && progress && <p className="text-[11px] text-slate-500">{progress}</p>}
          {!publishing && blockers.length > 0 && (
            <p className="text-[11px] text-slate-500">Still needed: {blockers.join(', ')}.</p>
          )}
        </div>
      </div>
    </div>
  )
}
