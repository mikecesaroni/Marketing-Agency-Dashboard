// The ad days behind the weekly status: four complete weeks of Meta and
// Google days plus the LSA weeks logged by hand, for every client, with the
// Supabase client passed in so the browser and the team-digest Edge
// Function run the same query.

import { fetchAllRows } from './pagedQuery.js'
import { addDays, today } from './dates.js'
import { reportWeeks } from './weeklyStatus.js'
import { legacySet, withoutLegacy } from './ourAds.js'

export async function fetchWeeklyRows(supabase, { day = today(), weeksBack = 0 } = {}) {
  const weeks = reportWeeks(day, weeksBack)
  const from = weeks[0]
  const to = addDays(weeks[weeks.length - 1], 6)
  const [metaRows, googleRows, lsaRows, legacyRows] = await Promise.all([
    fetchAllRows(() => supabase.from('ad_daily').select('id, client_id, campaign_id, date, leads, spend').gte('date', from).lte('date', to).order('id')).catch(() => []),
    fetchAllRows(() => supabase.from('google_campaign_daily').select('id, client_id, campaign_id, date, conversions, cost').gte('date', from).lte('date', to).order('id')).catch(() => []),
    supabase
      .from('weekly_kpis')
      .select('client_id, week_of, leads, ad_spend')
      .eq('channel', 'LSA')
      .gte('week_of', from)
      .lte('week_of', to)
      .then((r) => r.data || []),
    supabase.from('legacy_ad_campaigns').select('client_id, channel, campaign_id').then((r) => r.data || []).catch(() => []),
  ])
  // Our ads only (src/lib/ourAds.js): a campaign the client was running
  // before the account was connected is not a week of our ads.
  const legacy = legacySet(legacyRows)
  return { day, weeksBack, metaRows: withoutLegacy(metaRows, legacy, 'meta'), googleRows: withoutLegacy(googleRows, legacy, 'google'), lsaRows }
}
