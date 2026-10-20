import { supabase } from './supabaseClient'
import { fetchAllRows } from './pagedQuery'
import { daysAgo } from './dailySeries'
import { fetchAdDelivery, today } from './queries'
import { fetchNextStepsForAll } from './nextStepsData'
import { DROPS_RESET_KEY, syncedAdRows, videoDrops } from './videoLaunch'
import { adDeliveryAlerts } from './adHealth'
import { clientStatus, leadTotals } from './clientStatus'

/**
 * Everything the Client status board shows, for every active client: the
 * launch pipeline (the same one the client page and the dashboard show),
 * the video board's row, two weeks of leads and spend from Meta and Google,
 * the delivery alert, the payments. One round of queries, then
 * clientStatus() per client.
 */
export async function fetchClientStatus() {
  const day = today()
  const [pipeline, delivery, metaRows, googleRows, published, videos, files, reset, newest, payments] = await Promise.all([
    fetchNextStepsForAll(),
    fetchAdDelivery(),
    fetchAllRows(() => supabase.from('ad_daily').select('id, client_id, date, leads, spend').gte('date', daysAgo(13)).order('id')).catch(() => []),
    fetchAllRows(() => supabase.from('google_campaign_daily').select('id, client_id, date, conversions, cost').gte('date', daysAgo(13)).order('id')).catch(() => []),
    fetchAllRows(() => supabase.from('published_ads').select('client_id,created_at,status,size_key,video_id,ad_name').order('created_at').order('id')).catch(() => []),
    supabase.from('ad_videos').select('client_id,created_at,status,meta_video_id,thumb_url,storage_path,file_name,drop_dismissed_at').then((r) => r.data || []),
    supabase.from('client_files').select('client_id,storage_path,file_name,date_uploaded,uploaded_by,drop_dismissed_at').ilike('file_type', 'video/%').then((r) => r.data || []),
    supabase.from('app_settings').select('value').eq('key', DROPS_RESET_KEY).maybeSingle().then((r) => r.data?.value || ''),
    supabase.from('client_newest_ad').select('client_id,ad_id,ad_name,first_seen,is_video').then((r) => r.data || []),
    supabase.from('payments').select('client_id, payment_type, status, due_date, amount, failure_count').then((r) => r.data || []),
  ])

  const clients = pipeline.map((p) => p.client)
  const drops = new Map(videoDrops(clients, [...published, ...syncedAdRows(newest)], videos, new Date(), files, reset).map((d) => [d.id, d]))
  const alerts = new Map(adDeliveryAlerts(clients, delivery, day).map((a) => [a.client.id, a]))

  const adDays = new Map()
  const push = (id, row) => {
    if (!adDays.has(id)) adDays.set(id, [])
    adDays.get(id).push(row)
  }
  for (const r of metaRows) push(r.client_id, { date: r.date, leads: r.leads, spend: r.spend })
  for (const r of googleRows) push(r.client_id, { date: r.date, leads: r.conversions, spend: r.cost })
  const payBy = new Map()
  for (const p of payments) {
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

/** Sets a client's package. null clears it (back to the guess from the fee). */
export async function setClientTier(clientId, tier) {
  const { error } = await supabase.from('clients').update({ tier: tier || null }).eq('id', clientId)
  if (error) throw error
}
