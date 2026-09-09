import { supabase } from './supabaseClient'

// The Ad Doctor: the playbook's kill/scale rules plus the 2026 fatigue and
// retention signals, run as arithmetic against the daily sync.
//
// Deliberately a rules engine first, not a model call. The thresholds are
// stated in src/lib/metaKnowledge.js and the playbook, and the whole value of
// stating them is that the verdicts are reproducible and the reason prints
// next to each one. The model comes second: "Full diagnosis" hands the verdict
// table, the knowledge base and last night's learnings to the chat, which
// writes the prescription in words. The rules live in adDoctorRules.js so the
// check script can import them without dragging in the Supabase client.

export { VERDICT_META, diagnoseAds as diagnose } from './adDoctorRules.js'

// Last 30 days of daily rows: enough to see fatigue develop, recent enough
// that a long-dead ad does not haunt the list. The video columns are what the
// retention rules read; they are null on image ads and on rows synced before
// the retention fields were added.
export async function fetchAdDoctorData(clientId) {
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const sinceStr = since.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('ad_daily')
    .select(
      'ad_id, ad_name, campaign_name, adset_id, adset_name, effective_status, date, spend, impressions, reach, clicks, leads, video_plays, video_thruplays, video_2s_views'
    )
    .eq('client_id', clientId)
    .gte('date', sinceStr)
  if (error) throw error
  return data || []
}

// Every client's last 30 days in one go, for the dashboard digest. Paged,
// because eight clients already put the month near PostgREST's 1000-row page
// and a silently truncated result would drop whole clients off the board.
export async function fetchAdDoctorDataAll() {
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const sinceStr = since.toISOString().slice(0, 10)

  const PAGE = 1000
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('ad_daily')
      .select(
        'client_id, ad_id, ad_name, campaign_name, adset_id, adset_name, effective_status, date, spend, impressions, reach, clicks, leads, video_plays, video_thruplays, video_2s_views, clients(name, is_internal)'
      )
      .gte('date', sinceStr)
      .order('date', { ascending: true })
      .order('ad_id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return rows
}
