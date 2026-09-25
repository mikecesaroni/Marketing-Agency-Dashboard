import { useEffect, useMemo, useRef, useState } from 'react'
import ZoomImage from './ui/ZoomImage'
import LocationPicker from './LocationPicker'
import LeadFormPicker from './LeadFormPicker'
import { publishedNote, rememberQuietly } from '../lib/memory'
import FunnelBuilder from './FunnelBuilder'
import VideoAdPicker from './VideoAdPicker'
import { fetchSavedAds } from '../lib/savedAds'
import { wcName } from '../lib/adNaming'
import { ago } from '../lib/contentHub'
import {
  describeLaunch,
  launchSnapshot,
  launchSteps,
  readLaunchMemory,
  writeLaunchMemory,
} from '../lib/videoLaunch'
import {
  CTA_OPTIONS,
  MAX_BATCH_ADS,
  OBJECTIVES,
  SPECIAL_AD_CATEGORIES,
  ageFromIntake,
  budgetFromIntake,
  websiteFromIntake,
  dollarsToCents,
  imagesFromSet,
  locationsFromIntake,
  checkAdset,
  listAdsets,
  listCampaigns,
  publishAd,
  publishAdBatch,
  summarisePlan,
} from '../lib/metaPublish'

function Section({ step, id, title, hint, children }) {
  return (
    <section id={id} className="space-y-2 scroll-mt-24">
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

/**
 * The four steps of a launch, pinned to the top of the screen, each saying
 * where it stands. Videos · Words · Where · Publish. A click scrolls to the
 * section. This is the map for a teammate who has never been in here: the
 * seven numbered sections below are the detail, this is the shape.
 */
function LaunchStrip({ steps, onJump, stickyTop = 0 }) {
  return (
    <div
      className="sticky z-20 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur"
      style={{ top: stickyTop }}
    >
      <ol className="grid grid-cols-4 gap-2">
        {steps.map((s, i) => (
          <li key={s.key} className="min-w-0">
            <button
              type="button"
              onClick={() => onJump(s.key)}
              className="group flex w-full items-center gap-2 text-left"
              title={`Go to ${s.label}`}
            >
              <span
                className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  s.done ? 'bg-green-600 text-white' : s.key === 'go' && s.detail === 'ready' ? 'bg-orange-600 text-white' : 'bg-slate-200 text-slate-600 group-hover:bg-slate-300'
                }`}
              >
                {s.done ? '✓' : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-slate-800">{s.label}</span>
                <span className="block truncate text-[11px] text-slate-500">{s.detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * Last week's destination, offered back as one click.
 *
 * The clips and the words are new every week; the objective, the form, the
 * button and the ad sets almost never are. Recorded on every publish that
 * goes out, per client, in this browser. Nothing is applied until the
 * button is pressed, and every field it fills stays editable below.
 */
function SameAsLastTime({ memory, onUse, onDismiss }) {
  if (!memory) return null
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-emerald-900">Same place as last time?</p>
        <p className="truncate text-[11px] text-emerald-800" title={describeLaunch(memory, OBJECTIVES)}>
          Last launch {memory.at ? ago(memory.at) : ''}: {describeLaunch(memory, OBJECTIVES)}
        </p>
      </div>
      <button
        type="button"
        onClick={onUse}
        className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
      >
        Use the same setup
      </button>
      <button type="button" onClick={onDismiss} className="text-[11px] text-emerald-700 hover:underline">
        start fresh
      </button>
    </div>
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

/**
 * The result of publishing into SEVERAL ad sets.
 *
 * One row per ad set, because that is the unit that succeeds or fails: a run
 * that got ads into four of five ad sets is not a failure and must not read
 * like one, and the fifth has to be nameable so it can be retried on its own
 * rather than by running the whole thing again and doubling up the four.
 */
function PublishedAcrossAdsets({ runs, onAnother }) {
  const ok = runs.filter((r) => r.result)
  const failed = runs.filter((r) => r.error)
  const adsIn = (r) => {
    const rows = r.result?.results || (r.result?.ad_id ? [{ ok: true }] : [])
    return rows.filter((x) => x.ok !== false).length
  }
  const totalAds = ok.reduce((n, r) => n + adsIn(r), 0)
  // Any one of them reaches the right account in Ads Manager.
  const managerUrl = ok.find((r) => r.result?.ads_manager_url)?.result?.ads_manager_url

  return (
    <div
      className={`p-4 rounded-lg space-y-3 border ${
        failed.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
      }`}
    >
      <div>
        <p className="text-sm font-semibold text-green-900">
          {totalAds} ad{totalAds === 1 ? '' : 's'} created across {ok.length} ad set
          {ok.length === 1 ? '' : 's'} — all paused
        </p>
        <p className="mt-1 text-xs text-green-800">
          Nothing is spending. Each ad set keeps its own budget, targeting and schedule exactly as it
          was; this only added ads inside them.
        </p>
      </div>

      <ul className="space-y-1">
        {runs.map((r) => (
          <li
            key={r.adset_id}
            className={`rounded border px-2.5 py-1.5 text-xs ${
              r.error ? 'border-amber-300 bg-white' : 'border-green-200 bg-white/70'
            }`}
          >
            <span className="font-medium text-slate-900">{r.adset_name}</span>{' '}
            {r.error ? (
              <span className="text-amber-800">— {r.error}</span>
            ) : (
              <span className="text-green-800">
                — {adsIn(r)} ad{adsIn(r) === 1 ? '' : 's'}
              </span>
            )}
          </li>
        ))}
      </ul>

      {failed.length > 0 && (
        <p className="text-[11px] text-amber-800">
          The {failed.length === 1 ? 'one above' : `${failed.length} above`} got nothing. Publish
          again into just {failed.length === 1 ? 'that ad set' : 'those ad sets'} — re-running all of
          them would put a second copy into the ones that worked.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {managerUrl && (
          <a
            href={managerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-800"
          >
            Open in Ads Manager →
          </a>
        )}
        <button
          type="button"
          onClick={onAnother}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Publish more
        </button>
      </div>
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

/**
 * Meta errors that are really a one-time setting somebody has to go and click.
 *
 * These read like failures of the publish but are nothing to do with it: the
 * payload was fine, the account just has not been switched on for something
 * yet. They will happen once per client and then never again, which is exactly
 * the kind of thing nobody remembers the fix for -- so the fix is written here,
 * next to the error, with the link already pointed at the right Page.
 */
function setupFix(message, client) {
  const text = String(message || '')

  // Lead ads are gated on the PAGE accepting Meta's Lead Generation Terms,
  // separately from anything the ad account has agreed to. It has to be a Page
  // admin who clicks it; an ad account role is not enough.
  if (/lead\s*gen(eration)?\s*terms|leadgen.{0,20}terms of service/i.test(text)) {
    return {
      title: 'The Page has not accepted Meta\u2019s Lead Generation Terms yet.',
      body: `A Page admin for ${client.name} has to accept them once, and every lead ad for this client works afterwards. Nothing about the ad needs changing.`,
      href: client.meta_page_id
        ? `https://www.facebook.com/ads/leadgen/tos?page_id=${client.meta_page_id}`
        : 'https://www.facebook.com/ads/leadgen/tos',
      cta: 'Open the Lead Generation Terms',
    }
  }

  // Lead ads are rejected outright if the creative's link points anywhere on
  // facebook.com, however irrelevant that link is to how the ad works.
  if (/external url|link to external content/i.test(text)) {
    return {
      title: 'Meta wants a real website on the ad, not the Facebook Page.',
      body: `Put ${client.name}'s website in the Website field above and publish again. Nobody clicks it — the form still opens in place — but Meta refuses a lead ad that links to a Page. If they genuinely have no site, any page they own works: a booking page, a Google Business profile, their privacy policy.`,
      href: '',
      cta: '',
    }
  }

  // Per-placement creatives need an Instagram identity. Without one the ad
  // still publishes, carrying the feed image alone.
  if (/instagram account is missing|represent your business on instagram/i.test(text)) {
    return {
      title: 'No Instagram account is connected to this ad account.',
      body: `An ad carrying a different crop per placement needs one, because some of those placements are on Instagram. Connect an account under Business Settings, or publish one size at a time — a single-image ad does not need it.`,
      href: 'https://business.facebook.com/settings/instagram-account-v2',
      cta: 'Open Business Settings',
    }
  }

  // Meta throttles per ad account per rolling hour, and a batch publish is the
  // most call-hungry thing this CRM does: three image uploads plus a creative
  // plus an ad, per creative picked. On an app still on development access the
  // ceiling is low enough that one batch of five can reach it.
  if (/too many api calls|too many calls from this ad-?account|request limit reached/i.test(text)) {
    return {
      title: 'Meta throttled the ad account, not the ad.',
      body: `Nothing is wrong with what was being published. The quota is per ad account and refills over the following hour, so waiting and publishing again is the whole fix — and a failed read like the ad set list creates nothing, so there is no mess to clear up. If this keeps happening, the app is on Meta's development access tier: ads_management gets a small hourly allowance until Advanced Access is granted, and that allowance is shared by every client.`,
      href: 'https://developers.facebook.com/docs/marketing-api/overview/authorization',
      cta: 'How the access tiers differ',
    }
  }

  return null
}

function SetupFix({ error, client }) {
  const fix = setupFix(error, client)
  if (!fix) return null
  return (
    <div className="mt-2 pt-2 border-t border-red-200 space-y-1">
      <p className="text-xs font-medium text-red-800">{fix.title}</p>
      <p className="text-[11px] text-red-700">{fix.body}</p>
      {fix.href && (
        <a
          href={fix.href}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-[11px] font-medium text-red-800 underline hover:text-red-900"
        >
          {fix.cta} &rarr;
        </a>
      )}
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
          <ZoomImage
            src={thumb}
            alt=""
            caption={set.recipe?.hook || set.ordered[0]?.size?.label}
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
/**
 * `set` is OPTIONAL, and that is the whole reason a video can be published.
 *
 * This panel used to be reachable only by pressing Publish on a saved image
 * creative, so a client with no saved artboards could not open it at all --
 * which meant Reliable, Plumbquick and MBD had videos uploaded and no route to
 * an ad. With no set the panel opens empty and the video step is the way in.
 */
export default function PublishToMetaPanel({
  client,
  set = null,
  initialVideo = '',
  // The publish-a-video page: no image ads section, and the steps renumber.
  videoOnly = false,
  // Pixels of sticky header above this panel (the page's Layout header), so
  // the launch strip sticks below it rather than under it.
  stickyTop = 0,
  intake,
  alreadyPublished = [],
  onPublished,
}) {
  // Every saved creative for this client, so a launch can pick several without
  // going back to the gallery one at a time. The set that opened this panel is
  // the one that starts ticked.
  const [sets, setSets] = useState(set ? [set] : [])
  const [picked, setPicked] = useState(set ? [String(set.stamp)] : [])
  const [copies, setCopies] = useState({})
  const [openCopy, setOpenCopy] = useState(set ? String(set.stamp) : '')

  // Videos are picked by storage path rather than stamp: they are not artboard
  // sets and have no stamp. They publish as ads in the SAME ad set as the
  // image creatives, which is the point — a video and a static competing in
  // one ad set is a real test; in two ad sets it is two budgets.
  // A clip the board sent us to publish starts ticked; the picker fills in
  // its Meta ids and name once it has loaded the list.
  const [pickedVideos, setPickedVideos] = useState(initialVideo ? [initialVideo] : [])
  const [videoCopies, setVideoCopies] = useState({})

  const [cta, setCta] = useState('LEARN_MORE')
  const [linkUrl, setLinkUrl] = useState(() => websiteFromIntake(intake, client))

  // Instant form is the default: no landing page to build, and Meta prefills
  // the fields, so it is both less setup and a better mobile conversion rate.
  const [objective, setObjective] = useState('LEADS_FORM')
  const [leadForm, setLeadForm] = useState(null)
  const [specialCategory, setSpecialCategory] = useState('')

  const [reuseCampaign, setReuseCampaign] = useState(false)
  const [campaigns, setCampaigns] = useState(null)
  const [campaignId, setCampaignId] = useState('')
  // Every name starts WC_ (src/lib/adNaming.js). The default carries it so it
  // is visible in the field; the send below applies it again in case it was
  // typed over, and it is never stacked.
  const [campaignName, setCampaignName] = useState(wcName(`${client.name} — ${new Date().getFullYear()}`))

  const [reuseAdset, setReuseAdset] = useState(false)
  const [adsets, setAdsets] = useState(null)
  // SEVERAL ad sets, across as many campaigns as you like. An ad set belongs to
  // exactly one campaign, so picking ad sets picks the campaigns too -- there
  // is no separate campaign multi-select, and there should not be.
  //
  // This is the shape the creative-testing plan needs: the same hook in its own
  // ad set several times over, each with its own budget, is what stops one ad
  // starving the others inside a shared set (docs/creative-testing-plan.md).
  const [adsetIds, setAdsetIds] = useState([])
  // The funnel builder, opened from inside the ad set step.
  const [buildingFunnel, setBuildingFunnel] = useState(false)
  const [funnelBuilt, setFunnelBuilt] = useState(null)
  // Keyed by ad set id. Empty while nothing has been asked; each value is a
  // {ok} verdict from meta-adset-check.
  const [adsetChecks, setAdsetChecks] = useState({})

  const [adsetName, setAdsetName] = useState('')
  const [dailyBudget, setDailyBudget] = useState(() => budgetFromIntake(intake, client) || '20')
  // From the intake where it was asked, 25-65 where it was not. Every ad set
  // this CRM built used to go out at 25-65 regardless of what the client sells.
  const [ageMin, setAgeMin] = useState(() => ageFromIntake(intake).min)
  const [ageMax, setAgeMax] = useState(() => ageFromIntake(intake).max)
  const [locations, setLocations] = useState([])
  // Candidate locations read off the intake. Offered, never applied — see
  // locationsFromIntake for why picking the top match silently is dangerous.
  const [prefill, setPrefill] = useState(null)

  const [publishing, setPublishing] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [partial, setPartial] = useState(null)
  const [result, setResult] = useState(null)

  const chosenObjective = OBJECTIVES.find((o) => o.value === objective)

  // Where the last launch for this client went, from this browser. Offered,
  // never applied on its own: publishing into the wrong live ad set costs
  // real money, so it takes a click.
  const [memory, setMemory] = useState(() => readLaunchMemory(client.id))
  const applyMemory = () => {
    if (!memory) return
    setObjective(memory.objective || 'LEADS_FORM')
    setCta(memory.cta || 'LEARN_MORE')
    if (memory.linkUrl) setLinkUrl(memory.linkUrl)
    setSpecialCategory(memory.specialCategory || '')
    if (memory.leadForm?.id) setLeadForm({ id: memory.leadForm.id, name: memory.leadForm.name })
    if (memory.adsets?.length > 0) {
      setReuseCampaign(true)
      setReuseAdset(true)
      if (memory.campaignId) setCampaignId(memory.campaignId)
      setAdsetIds(memory.adsets.map((a) => a.id))
    }
    setMemory(null)
  }

  // The rest of the client's saved ads. Best effort — the set that opened the
  // panel is already here, so a failure costs the extra choices, not the page.
  useEffect(() => {
    if (videoOnly) return
    fetchSavedAds(client.id)
      .then((all) => {
        if (all.length > 0) setSets(all)
      })
      .catch(() => {})
  }, [client.id, videoOnly])

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
          ad_name: wcName(`${client.name} — ${r.hook || 'ad'}`).slice(0, 100),
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
  // Also loaded when reusing ad sets, because the ad set list spans every
  // campaign and needs their names to group by.
  useEffect(() => {
    if ((!reuseCampaign && !reuseAdset) || campaigns !== null) return
    listCampaigns(client.id)
      .then((found) => {
        setCampaigns(found)
        // Only when nothing chose one already: "same as last time" sets the
        // campaign before this list has loaded.
        if (found.length > 0) setCampaignId((cur) => cur || found[0].id)
      })
      .catch((err) => {
        setError(err.message)
        setCampaigns([])
      })
  }, [reuseCampaign, reuseAdset, campaigns, client.id])

  // Candidate locations from the intake. Fetched once, never applied: Meta's
  // geo search matches names worldwide, so "Long Island" comes back as Maine
  // before New York. Applying the top hit silently is how an ad set ends up
  // targeting the wrong state while looking like the client asked for it.
  useEffect(() => {
    if (!intake || prefill || reuseAdset) return
    let cancelled = false
    locationsFromIntake(intake)
      .then((found) => !cancelled && found.entries.length > 0 && setPrefill(found))
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intake, reuseAdset])

  // EVERY ad set on the account, not just the picked campaign's.
  //
  // It used to follow the campaign dropdown, which meant publishing the same
  // video into ad sets in two campaigns was two passes through this whole
  // panel. list_adsets already answered account-wide when given no campaign,
  // and every row carries its own campaign_id, so one call covers the lot and
  // the campaign picker above stops mattering once ad sets are being reused.
  useEffect(() => {
    if (!reuseAdset || adsets !== null) return
    listAdsets(client.id)
      .then((found) => {
        setAdsets(found)
        // Nothing is preselected. With one campaign's worth it was a fair
        // guess; across the account it would be a coin toss, and publishing
        // into the wrong live ad set costs real money.
      })
      .catch((err) => {
        setError(err.message)
        setAdsets([])
      })
  }, [reuseAdset, adsets, client.id])

  // Ask Meta whether the picked ad set can take an ad at all, before a single
  // image is uploaded into it. Belk's five ads were all built and all rejected
  // for the same reason, and the ad set could not be fixed afterwards.
  // Checked per ad set, once each.
  //
  // The obvious version of this loops over "ids with no verdict yet", which
  // re-fires every outstanding check each time one of them lands: tick three
  // boxes and the third ad set gets asked about three times. The ref records
  // what has been ASKED, which is the thing that must not repeat -- state
  // records what has been ANSWERED, which arrives later and is what the rest
  // of the screen reads.
  const asked = useRef(new Set())
  useEffect(() => {
    if (!reuseAdset) return
    for (const id of adsetIds) {
      if (asked.current.has(id)) continue
      asked.current.add(id)
      checkAdset(client.id, id)
        .then((verdict) => setAdsetChecks((prev) => ({ ...prev, [id]: verdict })))
        .catch(() => {
          // Deliberately optimistic. A check that fell over is not evidence
          // against the ad set, and blocking on it would break publishing.
          setAdsetChecks((prev) => ({
            ...prev,
            [id]: { ok: true, unchecked: 'The ad set check did not run.' },
          }))
        })
    }
  }, [reuseAdset, adsetIds, client.id])

  // A different client means different ad sets, and an id could repeat across
  // accounts, so the record of what has been asked cannot carry over.
  useEffect(() => {
    asked.current = new Set()
    setAdsetChecks({})
  }, [client.id])

  // Reusing an ad set only makes sense inside a campaign that already exists.
  useEffect(() => {
    if (!reuseCampaign) setReuseAdset(false)
  }, [reuseCampaign])

  const chosenCampaign = reuseCampaign ? campaigns?.find((c) => c.id === campaignId) : null
  const chosenAdsets = reuseAdset ? (adsets || []).filter((a) => adsetIds.includes(a.id)) : []
  // Ad sets grouped under their campaign, in the order Meta listed the ad sets
  // so the newest work stays near the top. A campaign whose name has not
  // loaded yet still gets a group rather than vanishing from the list.
  const campaignGroups = []
  for (const a of adsets || []) {
    const id = a.campaign_id || ''
    let group = campaignGroups.find((g) => g.id === id)
    if (!group) {
      group = {
        id,
        name: campaigns?.find((c) => c.id === id)?.name || 'Campaign',
        adsets: [],
      }
      campaignGroups.push(group)
    }
    group.adsets.push(a)
  }
  // The first one stands in wherever a single ad set used to be read: the
  // objective label, the plan sentence. They all share a campaign objective in
  // practice, and where they do not, the warning below says so.
  const chosenAdset = chosenAdsets[0] || null
  const failedChecks = adsetIds.filter((id) => adsetChecks[id]?.ok === false)
  const pendingChecks = adsetIds.filter((id) => !adsetChecks[id])
  // Publishing into ad sets whose campaigns disagree about the objective is
  // allowed -- each ad is built against its own ad set -- but the copy and CTA
  // on this screen were written for one of them.
  const mixedObjectives = new Set(chosenAdsets.map((a) => a.objective).filter(Boolean)).size > 1
  const budgetCents = dollarsToCents(dailyBudget)

  const pickedSets = sets.filter((s) => picked.includes(String(s.stamp)))
  const maxSizes = Math.max(1, ...pickedSets.map((s) => s.ordered.length))

  const togglePick = (stamp) =>
    setPicked((prev) =>
      prev.includes(stamp) ? prev.filter((s) => s !== stamp) : [...prev, stamp]
    )

  const blockers = []
  if (missing.length > 0) blockers.push('missing client details')
  const adTotal = pickedSets.length + pickedVideos.length
  if (adTotal === 0) blockers.push('no creative picked')
  if (adTotal > MAX_BATCH_ADS) blockers.push(`more than ${MAX_BATCH_ADS} creatives`)
  if (pickedVideos.some((path) => !videoCopies[path]?.primary_text?.trim()))
    blockers.push('a video has no primary text')
  if (pickedSets.some((s) => !copies[String(s.stamp)]?.primary_text?.trim()))
    blockers.push('a creative has no primary text')
  if (chosenObjective?.needsLink && !linkUrl.trim()) blockers.push('no landing page')
  if (chosenObjective?.needsForm && !leadForm) blockers.push('no instant form picked')
  if (reuseCampaign && !reuseAdset && !campaignId) blockers.push('no campaign picked')
  if (reuseAdset && adsetIds.length === 0) blockers.push('no ad set picked')
  // Waiting on the verdict counts as a blocker too, so a fast click cannot
  // start the upload while the answer is still in flight.
  if (reuseAdset && pendingChecks.length > 0)
    blockers.push(pendingChecks.length === 1 ? 'still checking the ad set' : `still checking ${pendingChecks.length} ad sets`)
  if (failedChecks.length > 0)
    blockers.push(failedChecks.length === 1 ? 'that ad set cannot take ads' : `${failedChecks.length} ad sets cannot take ads`)
  // One ad per ad set is the point of picking several; the same creative into
  // twenty of them is almost always a misclick on a select-all.
  if (reuseAdset && adTotal * adsetIds.length > MAX_BATCH_ADS * 4)
    blockers.push(`that is ${adTotal * adsetIds.length} ads — too many at once`)
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
    // Replaced per ad set once the loop starts, so a run across several is not
    // a frozen message for a minute.
    const targets = reuseAdset ? adsetIds.length : 1
    setProgress(
      adTotal === 1 && targets === 1
        ? 'Creating the ad…'
        : targets === 1
          ? `Creating ${adTotal} ads in one ad set…`
          : `Creating ${adTotal * targets} ads across ${targets} ad sets…`
    )
    try {
      const today = new Date().toISOString().slice(0, 10)
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
          // Always sent, always prefixed. Left blank, the function would name
          // the ad itself, without the prefix.
          ad_name: wcName(c.ad_name?.trim() || `${client.name} — ${today}`),
          cta,
          link_url: linkUrl.trim() || undefined,
          lead_form_id: leadForm?.id,
          lead_form_name: leadForm?.name,
        }
      })

      // Video ads carry a Meta video id instead of artboards. Everything else
      // — copy, CTA, link, lead form — is identical, so they go into the same
      // list and the same ad set.
      const videoAds = pickedVideos.map((path) => {
        const c = videoCopies[path] || {}
        return {
          video_id: c.meta_video_id,
          video_thumb_url: c.thumb_url || undefined,
          primary_text: c.primary_text?.trim(),
          headline: c.headline?.trim() || undefined,
          description: c.description?.trim() || undefined,
          ad_name: wcName(c.ad_name?.trim() || `${client.name} — ${today}`),
          cta,
          link_url: linkUrl.trim() || undefined,
          lead_form_id: leadForm?.id,
          lead_form_name: leadForm?.name,
        }
      })
      ads.push(...videoAds)

      const shared = {
        client_id: client.id,
        objective,
        special_ad_categories: specialCategory ? [specialCategory] : [],
        // Both named here rather than left to the function's defaults, so the
        // WC_ rule holds whether or not a name was typed.
        campaign_name: reuseCampaign ? undefined : wcName(campaignName.trim()),
        adset_name: reuseAdset ? undefined : wcName(adsetName.trim() || `${client.name} — ${today}`),
        daily_budget_cents: reuseAdset ? undefined : budgetCents,
        locations: reuseAdset ? [] : locations,
        age_min: Number(ageMin),
        age_max: Number(ageMax),
      }

      // One creative still goes through the single-ad action, which keeps the
      // long-standing response shape and its error handling intact.
      const publishInto = (target) =>
        ads.length === 1
          ? publishAd({ ...shared, ...target, ...ads[0] })
          : publishAdBatch({ ads, ...shared, ...target })

      let data
      if (!reuseAdset) {
        data = await publishInto({ campaign_id: reuseCampaign ? campaignId : undefined })
      } else {
        // ONE CALL PER AD SET, in sequence rather than at once.
        //
        // Sequential because each call uploads images and creates ads against
        // the same ad account, and Meta rate-limits per account -- firing six
        // at once is how you turn a slow publish into a failed one. Each ad
        // set's campaign_id comes off the ad set itself, not the campaign
        // dropdown, because they may well be in different campaigns.
        //
        // A failure is recorded and the run continues. The alternative is
        // stopping halfway with no way to tell which ad sets already have the
        // ads, which is worse than finishing and reporting.
        const runs = []
        for (const [i, id] of adsetIds.entries()) {
          const adset = adsets?.find((a) => a.id === id)
          setProgress(
            `Ad set ${i + 1} of ${adsetIds.length}${adset?.name ? ` — ${adset.name}` : ''}…`
          )
          try {
            runs.push({
              adset_id: id,
              adset_name: adset?.name || id,
              result: await publishInto({ adset_id: id, campaign_id: adset?.campaign_id }),
            })
          } catch (err) {
            runs.push({ adset_id: id, adset_name: adset?.name || id, error: err.message })
          }
        }
        // A single ad set keeps the exact result shape it has always had, so
        // the screen below and everything reading it are untouched.
        data = runs.length === 1 && runs[0].result ? runs[0].result : { runs }
        if (runs.length === 1 && runs[0].error) throw new Error(runs[0].error)
      }

      setResult(data)
      onPublished?.()
      // Next week's "same place as last time": only the ad sets that took
      // the ads, and the destination settings that went with them.
      const landed = data?.runs
        ? data.runs.filter((r) => r.result).map((r) => ({ id: r.adset_id, name: r.adset_name }))
        : data?.adset_id
          ? [{ id: data.adset_id, name: chosenAdset?.name || adsetName || '' }]
          : []
      writeLaunchMemory(
        client.id,
        launchSnapshot({
          objective,
          cta,
          linkUrl,
          leadForm,
          specialCategory,
          adsets: landed,
          campaignId: data?.campaign_id || campaignId,
          reuseCampaign: true,
        })
      )
      // Into memory, so the chat knows what went live and when to judge it.
      rememberQuietly({
        clientId: client.id,
        source: 'publish',
        headline: publishedNote({
          clientName: client.name,
          industry: client.industry,
          hooks: pickedSets.map((s) => s.recipe?.hook || copies[String(s.stamp)]?.ad_name || String(s.stamp)),
        }),
        // Across every ad set, so memory records the whole publish rather than
        // whichever one happened to be first.
        evidence: {
          stamps: pickedSets.map((s) => s.stamp),
          ad_ids: (data?.runs ? data.runs.map((r) => r.result).filter(Boolean) : [data]).flatMap(
            (r) => [].concat(r?.ad_id || [], (r?.results || []).map((x) => x.ad_id).filter(Boolean))
          ),
          adset_ids: data?.runs ? data.runs.map((r) => r.adset_id) : undefined,
        },
      })
    } catch (err) {
      setError(err.message)
      setPartial(err.partial || null)
    } finally {
      setPublishing(false)
      setProgress('')
    }
  }

  if (result) {
    const goAgain = () => {
      // Straight back into the same ad sets: the point of publishing more is
      // usually to add to what was just made, not to build a second one.
      if (result.runs) {
        setReuseCampaign(true)
        setReuseAdset(true)
        // Only the ones that worked. Re-offering a failed ad set as a default
        // would walk straight back into the same failure.
        setAdsetIds(result.runs.filter((r) => r.result).map((r) => r.adset_id))
      } else if (result.adset_id) {
        setReuseCampaign(true)
        setCampaignId(result.campaign_id || '')
        setReuseAdset(true)
        setAdsetIds([result.adset_id])
      }
      setPicked([])
      setResult(null)
    }

    return result.runs ? (
      <PublishedAcrossAdsets runs={result.runs} onAnother={goAgain} />
    ) : (
      <Published result={result} onAnother={goAgain} />
    )
  }

  const step = (n) => (chosenObjective?.needsForm ? n : n - 1)
  // Section numbers: the image ads section is 2 and goes away in video-only
  // mode, so everything after it moves up one.
  const num = (n) => String(videoOnly && n > 2 ? n - 1 : n)

  // The strip at the top: derived from the same state the sections edit.
  const withCopy =
    pickedVideos.filter((p) => videoCopies[p]?.primary_text?.trim()).length +
    pickedSets.filter((s) => copies[String(s.stamp)]?.primary_text?.trim()).length
  const destination = reuseAdset
    ? adsetIds.length === 0
      ? ''
      : chosenAdsets.length > 0
        ? chosenAdsets.map((a) => a.name).join(', ')
        : `${adsetIds.length} ad set${adsetIds.length === 1 ? '' : 's'}`
    : reuseCampaign
      ? chosenCampaign
        ? `new ad set in ${chosenCampaign.name}`
        : ''
      : campaignName.trim()
        ? `new campaign ${wcName(campaignName.trim())}`
        : ''
  const steps = launchSteps({ picked: adTotal, withCopy, destination, blockers })
  const jump = (key) => {
    const id = key === 'videos' || key === 'words' ? 'launch-videos' : key === 'where' ? 'launch-where' : 'launch-go'
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-5">
      <LaunchStrip steps={steps} onJump={jump} stickyTop={stickyTop} />

      <SameAsLastTime memory={memory} onUse={applyMemory} onDismiss={() => setMemory(null)} />

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
          <SetupFix error={error} client={client} />
          <PartialWarning partial={partial} />
        </div>
      )}

      <Section
        step="1"
        id="launch-videos"
        title="Videos"
        hint="Drop the week's clips. Each one goes to Meta straight away, gets transcribed, and gets three versions of its copy written. Tick a clip, pick a version, done."
      >
        <VideoAdPicker
          client={client}
          intake={intake}
          picked={pickedVideos}
          onPicked={setPickedVideos}
          copies={videoCopies}
          onCopy={(path, patch) =>
            setVideoCopies((prev) => ({ ...prev, [path]: { ...prev[path], ...patch } }))
          }
        />
      </Section>

      {!videoOnly && (
      <Section
        step="2"
        title="Image ads"
        hint="Optional. Tick any saved statics going out with the clips. Everything ticked lands in the same ad set, which is the only way testing them against each other means anything."
      >
        {sets.length === 0 && (
          <p className="text-xs text-slate-500">
            No saved image ads for {client.name}. A launch can be video only; design a static on the
            Design tab if one is wanted.
          </p>
        )}
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
      )}

      <Section step={num(3)} title="Button and destination" hint="Shared by every ad in this publish.">
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
          {/* A form ad is asked for this too. The button opens the form and the
              link is never followed, but Meta rejects a lead ad whose creative
              points at a Facebook Page, so there has to be somewhere real to
              put. It used to say "no landing page" here and publishing failed
              at the very last step because of it. */}
          <Text
            label={chosenObjective?.needsForm ? 'Website (required by Meta)' : 'Landing page'}
            value={linkUrl}
            onChange={setLinkUrl}
            placeholder="https://…"
            hint={
              chosenObjective?.needsForm
                ? 'Nobody follows it — the form opens in place. Meta rejects lead ads that link to a Facebook Page.'
                : client.website_url
                  ? 'from the client'
                  : intake?.website
                    ? 'from the intake form'
                    : 'not set on the client'
            }
          />
        </div>
      </Section>

      <Section step={num(4)} title="Objective">
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
          step={num(5)}
          title="The instant form"
          hint="Where the leads actually land. Reuse one where you can — a form owns its leads."
        >
          <LeadFormPicker client={client} value={leadForm} onChange={setLeadForm} />
        </Section>
      )}

      <Section
        step={num(step(6))}
        id="launch-where"
        title="Campaign"
        hint="Reusing a campaign keeps its learning; a new one starts cold."
      >
        {/* BUILD THE FUNNEL. Above the toggle, and gated on nothing, because
            this is the answer for an account that has no campaigns yet -- it
            was originally offered only after picking an existing campaign AND
            an existing ad set, which is the one path somebody with no funnel
            would never take. A button reading "no funnel yet?" has to be
            visible to the person who has no funnel. */}
        {!buildingFunnel && !funnelBuilt && (
          <button
            type="button"
            onClick={() => setBuildingFunnel(true)}
            className="w-full rounded-lg border border-dashed border-orange-300 bg-orange-50/50 px-3 py-2 text-left text-xs text-orange-900 hover:bg-orange-50"
          >
            <span className="font-semibold">Build a top of funnel + retargeting pair &rarr;</span>
            <span className="mt-0.5 block text-[11px] text-orange-800">
              Two campaigns: a cold one that excludes everyone already in the funnel, and a
              retargeting one that goes after them. Created paused, and selected below so these
              creatives go straight into them.
            </span>
          </button>
        )}

        {buildingFunnel && (
          <div className="rounded-lg border border-orange-200 bg-orange-50/40 p-3">
            <FunnelBuilder
              client={client}
              locations={locations}
              ageMin={ageMin}
              ageMax={ageMax}
              specialCategory={specialCategory}
              onCancel={() => setBuildingFunnel(false)}
              onBuilt={(result) => {
                setBuildingFunnel(false)
                // Straight into publishing: flip both pickers to the reuse
                // side, re-read the account so the new ad sets are in the
                // list, and tick exactly the ones just made.
                setReuseCampaign(true)
                setReuseAdset(true)
                setCampaigns(null)
                setAdsets(null)
                setAdsetIds((result.adsets || []).map((a) => a.id))
                setFunnelBuilt(result)
              }}
            />
          </div>
        )}

        {funnelBuilt && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
            <p className="font-semibold">
              Built {funnelBuilt.campaigns?.length || 0} campaigns and {funnelBuilt.adsets?.length || 0} ad
              sets, all paused.
            </p>
            <p className="mt-0.5 text-[11px] text-green-800">
              The new ad sets are ticked in the ad set step below. Publish now and the creatives go
              into them; nothing spends until you switch it on in Ads Manager.
            </p>
          </div>
        )}

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
          <Text
            label="Campaign name"
            value={campaignName}
            onChange={setCampaignName}
            hint="starts WC_ — added if left off"
          />
        )}
      </Section>

      <Section
        step={num(step(7))}
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
              <div className="max-h-72 space-y-2 overflow-y-auto rounded border border-slate-200 p-2">
                {campaignGroups.map((group) => (
                  <div key={group.id}>
                    <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {group.name}
                    </p>
                    {group.adsets.map((a) => {
                      const on = adsetIds.includes(a.id)
                      const verdict = adsetChecks[a.id]
                      return (
                        <label
                          key={a.id}
                          className={`flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-xs hover:bg-slate-50 ${
                            verdict?.ok === false ? 'text-red-800' : 'text-slate-800'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              setAdsetIds((prev) =>
                                prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id]
                              )
                            }
                            className="mt-0.5"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">{a.name}</span>
                            <span className="text-slate-500">
                              {a.daily_budget ? ` · $${(Number(a.daily_budget) / 100).toFixed(2)}/day` : ''}
                              {` · ${a.effective_status || a.status}`}
                            </span>
                            {on && verdict?.ok === false && (
                              <span className="block whitespace-pre-line text-[11px] text-red-700">
                                {verdict.error}
                              </span>
                            )}
                            {on && !verdict && (
                              <span className="block text-[11px] text-slate-500">checking…</span>
                            )}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">
                {adsetIds.length === 0
                  ? 'Tick every ad set these creatives should go into. They can be in different campaigns.'
                  : `${adTotal || 'The'} creative${adTotal === 1 ? '' : 's'} into ${adsetIds.length} ad set${
                      adsetIds.length === 1 ? '' : 's'
                    } — ${adTotal * adsetIds.length} ad${adTotal * adsetIds.length === 1 ? '' : 's'} in total. Each ad set keeps its own budget, targeting and schedule.`}
              </p>
              {mixedObjectives && (
                <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                  These ad sets do not all share an objective. Each ad is built against its own ad
                  set, so this works — but the copy and button on this screen were written once, and
                  a lead-form ad set and a traffic ad set usually want different wording.
                </p>
              )}
              {chosenAdsets.some((a) => a.live) && failedChecks.length === 0 && (
                <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                  {chosenAdsets.filter((a) => a.live).length === 1
                    ? 'One of these ad sets is delivering right now.'
                    : `${chosenAdsets.filter((a) => a.live).length} of these ad sets are delivering right now.`}{' '}
                  The new ads arrive paused, but switching one on puts it into a live auction
                  immediately.
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
                placeholder={wcName(`${client.name} — ${new Date().toISOString().slice(0, 10)}`)}
                hint="optional · starts WC_"
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
              {prefill && (
                <div className="mb-2 p-2 rounded border border-slate-200 bg-slate-50">
                  <p className="text-[11px] text-slate-600">
                    From the intake form
                    {prefill.source === 'service_area' ? ' (service area)' : ' (cities to target)'}.
                    Click the right one — the same city name exists in several states, so these are
                    suggestions rather than picks.
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {prefill.entries.map((entry) => (
                      <li key={entry.query}>
                        <span className="text-[11px] text-slate-500">
                          &ldquo;{entry.query}&rdquo; · {entry.radius} mi
                        </span>
                        {entry.candidates.length === 0 ? (
                          <span className="ml-1 text-[11px] text-amber-700">
                            no match, add it by hand
                          </span>
                        ) : (
                          <span className="flex flex-wrap gap-1 mt-0.5">
                            {entry.candidates.map((c) => {
                              const already = locations.some((l) => l.key === c.key)
                              return (
                                <button
                                  key={c.key}
                                  disabled={already}
                                  onClick={() =>
                                    setLocations((prev) =>
                                      prev.some((l) => l.key === c.key)
                                        ? prev
                                        : [
                                            ...prev,
                                            {
                                              ...c,
                                              radius: c.type === 'city' ? entry.radius : undefined,
                                            },
                                          ]
                                    )
                                  }
                                  className={`px-2 py-0.5 rounded-full border text-[11px] transition ${
                                    already
                                      ? 'border-slate-200 bg-slate-100 text-slate-400'
                                      : 'border-slate-300 bg-white text-slate-700 hover:border-orange-400 hover:bg-orange-50'
                                  }`}
                                >
                                  {already ? '\u2713 ' : '+ '}
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
            </div>
          </>
        )}
      </Section>

      <div
        id="launch-go"
        className="sticky bottom-0 -mx-1 space-y-2 rounded-t-xl border-t border-slate-200 bg-white/95 px-1 pt-3 pb-2 backdrop-blur scroll-mt-24"
      >
        <p className="text-xs text-slate-600">
          {summarisePlan({
            objective,
            dailyBudget,
            locations,
            campaignName,
            reuseCampaign,
            formName: leadForm?.name,
            adCount: adTotal,
            sizeCount: maxSizes,
            reuseAdset: chosenAdset,
            adsetCount: reuseAdset ? adsetIds.length : 1,
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
              : `Publish ${adTotal || ''} paused to Meta`.replace('  ', ' ')}
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
