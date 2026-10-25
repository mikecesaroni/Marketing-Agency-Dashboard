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
import { clientStatus, leadTotals } from './clientStatus.js'

/** The raw rows: the pipeline's, the delivery view, two weeks of ad days, the video board's inputs, the payments. */
export async function fetchStatusRows(supabase, { internalColumn = true, day = today() } = {}) {
  const [pipeline, deliveryRes, metaRows, googleRows, published, videos, files, reset, newest, payments] = await Promise.all([
    fetchPipelineRows(supabase, { internalColumn, day }),
    supabase.from('client_ad_delivery').select('client_id, last_spend_date, spend_7d, spend_30d'),
    fetchAllRows(() => supabase.from('ad_daily').select('id, client_id, date, leads, spend').gte('date', addDays(day, -13)).order('id')).catch(() => []),
    fetchAllRows(() => supabase.from('google_campaign_daily').select('id, client_id, date, conversions, cost').gte('date', addDays(day, -13)).order('id')).catch(() => []),
    fetchAllRows(() => supabase.from('published_ads').select('client_id,created_at,status,size_key,video_id,ad_name').order('created_at').order('id')).catch(() => []),
    supabase.from('ad_videos').select('client_id,created_at,status,meta_video_id,thumb_url,storage_path,file_name,drop_dismissed_at').then((r) => r.data || []),
    supabase.from('client_files').select('client_id,storage_path,file_name,date_uploaded,uploaded_by,drop_note,drop_dismissed_at').ilike('file_type', 'video/%').then((r) => r.data || []),
    supabase.from('app_settings').select('value').eq('key', DROPS_RESET_KEY).maybeSingle().then((r) => r.data?.value || ''),
    supabase.from('client_newest_ad').select('client_id,ad_id,ad_name,first_seen,is_video').then((r) => r.data || []),
    supabase.from('payments').select('client_id, payment_type, status, due_date, amount, failure_count').then((r) => r.data || []),
  ])
  return {
    day,
    pipeline,
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
  }
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
  for (const r of raw.metaRows || []) push(r.client_id, { date: r.date, leads: r.leads, spend: r.spend })
  for (const r of raw.googleRows || []) push(r.client_id, { date: r.date, leads: r.conversions, spend: r.cost })
  const payBy = new Map()
  for (const p of raw.payments || []) {
    if (!payBy.has(p.client_id)) payBy.set(p.client_id, [])
    payBy.get(p.client_id).push(p)
  }

  return pipeline.map(({ client, intake, result }) =>
    clientStatus({
      client,
      intake,
      result,
      drop: drops.get(client.id) || null,
      leads: leadTotals(adDays.get(client.id) || [], day),
      alert: alerts.get(client.id) || null,
      payments: payBy.get(client.id) || [],
      counts: { kpisThisWeek: result.steps.find((s) => s.key === 'weekly-kpis')?.done ? 1 : 0 },
      today: day,
    })
  )
}
