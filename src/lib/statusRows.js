// Everything the Client status board shows, for every active client, as one
// round of queries (fetchStatusRows) and one pure step (statusFromRows).
//
// The same split as pipelineRows.js and for the same reason: the browser
// (clientStatusData.js) and the team-digest Edge Function both run these,
// each with its own Supabase client, and the flags in the morning brief are
// the flags on the board because they are the same function.

import { fetchAllRows } from './pagedQuery.js'
import { addDays, today } from './dates.js'
import { fetchPipelineRows, pipelineFromRows } from './pipelineRows.js'
import { DROPS_RESET_KEY, syncedAdRows, videoDrops } from './videoLaunch.js'
import { adDeliveryAlerts } from './adHealth.js'
import { channelDays, clientStatus, leadTotals } from './clientStatus.js'
import { waitingStatics } from './staticDrops.js'
import { clientsLegacy, legacySet, withoutLegacy } from './ourAds.js'
import { googleAdDays, ourLeadRows, payPerLeadWeek } from './pplDays.js'

/**
 * The raw rows: the pipeline's, the delivery view, two weeks of ad days, the video board's inputs, the payments.
 *
 * `ours` true keeps our own businesses in the roster: the morning brief, its
 * alerts and the weekly status count them like a client's ads ("can we
 * include both Horizons in the morning brief", 2026-11-19). The Client tiers
 * board leaves it off: a package checklist says nothing about a business
 * that is ours.
 */
export async function fetchStatusRows(supabase, { internalColumn = true, day = today(), ours = false } = {}) {
  const [pipeline, deliveryRes, metaRows, googleRows, published, videos, files, reset, newest, payments, legacy, starts, statics, lsaLeads] = await Promise.all([
    fetchPipelineRows(supabase, { internalColumn, day, ours }),
    supabase.from('client_ad_delivery').select('client_id, last_spend_date, spend_7d, spend_30d'),
    fetchAllRows(() => supabase.from('ad_daily').select('id, client_id, campaign_id, date, leads, spend').gte('date', addDays(day, -13)).order('id')).catch(() => []),
    fetchAllRows(() => supabase.from('google_campaign_daily').select('id, client_id, campaign_id, campaign_type, campaign_name, date, conversions, cost').gte('date', addDays(day, -13)).order('id')).catch(() => []),
    fetchAllRows(() => supabase.from('published_ads').select('client_id,created_at,status,size_key,video_id,ad_name,stamp').order('created_at').order('id')).catch(() => []),
    supabase.from('ad_videos').select('client_id,created_at,status,meta_video_id,thumb_url,storage_path,file_name,drop_dismissed_at').then((r) => r.data || []),
    supabase.from('client_files').select('client_id,storage_path,file_name,date_uploaded,uploaded_by,drop_note,drop_dismissed_at').ilike('file_type', 'video/%').then((r) => r.data || []),
    supabase.from('app_settings').select('value').eq('key', DROPS_RESET_KEY).maybeSingle().then((r) => r.data?.value || ''),
    supabase.from('client_newest_ad').select('client_id,ad_id,ad_name,first_seen,is_video').then((r) => r.data || []),
    supabase.from('payments').select('client_id, payment_type, status, due_date, amount, failure_count').then((r) => r.data || []),
    // The client's own campaigns, spending before we connected the account
    // (src/lib/ourAds.js). A project without the view reads as none.
    supabase.from('legacy_ad_campaigns').select('client_id, channel, campaign_id').then((r) => r.data || []).catch(() => []),
    // The first day our ads spent anything, per client (supabase/ad-start.sql),
    // so a client two weeks in is told apart from one running a year: the
    // low-leads flag says "still in learning phase" on the former.
    supabase.from('client_ad_start').select('client_id, first_spend_date, first_meta_spend_date, first_google_spend_date').then((r) => r.data || []).catch(() => []),
    // The editor's dropped statics (src/lib/staticDrops.js), so the channel
    // and the brief can say one is waiting, the way they do for a clip.
    supabase.from('client_files').select('client_id,storage_path,file_name,date_uploaded,uploaded_by,drop_note,drop_dismissed_at').eq('drop_kind', 'static').then((r) => r.data || []).catch(() => []),
    // Google pay per lead (Local Services): the leads Google reported, one
    // row a call, message or booking (src/lib/pplDays.js). A project without
    // the table reads as none.
    fetchAllRows(() => supabase.from('lsa_leads').select('id, client_id, created_date, lead_charged').gte('created_date', addDays(day, -13)).order('id')).catch(() => []),
  ])
  return {
    day,
    pipeline,
    legacy,
    starts,
    statics,
    // A project without the view applied should not take the board down; the
    // account status alone still catches a disabled account.
    delivery: deliveryRes.error ? {} : Object.fromEntries((deliveryRes.data || []).map((r) => [r.client_id, r])),
    metaRows,
    googleRows,
    published,
    videos,
    files,
    reset,
    newest,
    payments,
    lsaLeads,
  }
}

/**
 * The campaigns that are a client's own from before we connected the account
 * (src/lib/ourAds.js). Never one of our own businesses': everything in our
 * own account is ours.
 */
const legacyOf = (raw) => legacySet(clientsLegacy(raw.legacy, raw.pipeline?.clients))

/** Google's ad days with pay per lead counted from the lead records, our campaigns only. */
function googleDays(raw) {
  const legacy = legacyOf(raw)
  return googleAdDays(withoutLegacy(raw.googleRows, legacy, 'google'), ourLeadRows(raw.lsaLeads, raw.googleRows, legacy))
}

/**
 * Pay per lead over the last seven days, per business, for the morning
 * brief's own section (payPerLeadWeek in src/lib/pplDays.js): every business
 * in the brief that is not on pause, our own included when the roster has
 * them (fetchStatusRows with `ours`).
 */
export function payPerLeadFromRows(raw) {
  return payPerLeadWeek({ days: googleDays(raw), clients: (raw.pipeline?.clients || []).filter((c) => !c.paused_at), today: raw.day || today() })
}

/** One clientStatus() row per client. Pure; `now` is for the video board's day counts. */
export function statusFromRows(raw, { now = new Date() } = {}) {
  const day = raw.day || today()
  const pipeline = pipelineFromRows(raw.pipeline)
  const clients = pipeline.map((p) => p.client)
  const drops = new Map(videoDrops(clients, [...(raw.published || []), ...syncedAdRows(raw.newest || [])], raw.videos || [], now, raw.files || [], raw.reset || '').map((d) => [d.id, d]))
  const alerts = new Map(adDeliveryAlerts(clients, raw.delivery || {}, day).map((a) => [a.client.id, a]))

  const adDays = new Map()
  const push = (id, row) => {
    if (!adDays.has(id)) adDays.set(id, [])
    adDays.get(id).push(row)
  }
  // Our ads only: a campaign the client was already running before the
  // account was connected is theirs, and says nothing about ours.
  const legacy = legacyOf(raw)
  // Tagged by channel, so the leads flags can say which one the leads came
  // from ("only Google live, Meta not yet"); leadTotals ignores the tag.
  for (const r of withoutLegacy(raw.metaRows, legacy, 'meta')) push(r.client_id, { date: r.date, leads: r.leads, spend: r.spend, channel: 'meta' })
  // Google: a campaign's conversions are its leads, except pay per lead,
  // whose leads are the lead records Google reported (src/lib/pplDays.js).
  for (const r of googleDays(raw)) push(r.client_id, r)
  const payBy = new Map()
  for (const p of raw.payments || []) {
    if (!payBy.has(p.client_id)) payBy.set(p.client_id, [])
    payBy.get(p.client_id).push(p)
  }
  const starts = new Map((raw.starts || []).map((r) => [r.client_id, { first: r.first_spend_date ? String(r.first_spend_date).slice(0, 10) : null, meta: Boolean(r.first_meta_spend_date), google: Boolean(r.first_google_spend_date) }]))
  // The dropped statics waiting per client (src/lib/staticDrops.js): the
  // same window and "start fresh" moment as the clips.
  const staticFiles = new Map()
  for (const f of raw.statics || []) {
    if (!f?.client_id) continue
    if (!staticFiles.has(f.client_id)) staticFiles.set(f.client_id, [])
    staticFiles.get(f.client_id).push(f)
  }
  const publishedBy = new Map()
  for (const p of raw.published || []) {
    if (!p?.client_id) continue
    if (!publishedBy.has(p.client_id)) publishedBy.set(p.client_id, [])
    publishedBy.get(p.client_id).push(p)
  }

  return pipeline.map(({ client, intake, result }) => {
    const rows = adDays.get(client.id) || []
    const start = starts.get(client.id) || {}
    return clientStatus({
      statics: staticFiles.has(client.id) ? waitingStatics({ files: staticFiles.get(client.id), ads: publishedBy.get(client.id) || [], now, resetAt: raw.reset || '' }) : [],
      client,
      intake,
      result,
      drop: drops.get(client.id) || null,
      leads: leadTotals(rows, day),
      adsStart: start.first || null,
      // Days each channel spent this week, and whether it ever has, for the
      // why on the leads flags.
      channels: { ...channelDays(rows, day), metaEver: Boolean(start.meta), googleEver: Boolean(start.google) },
      alert: alerts.get(client.id) || null,
      payments: payBy.get(client.id) || [],
      counts: { kpisThisWeek: result.steps.find((s) => s.key === 'weekly-kpis')?.done ? 1 : 0 },
      today: day,
    })
  })
}
