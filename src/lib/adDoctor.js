import { supabase } from './supabaseClient'

// The Ad Doctor: the playbook's kill/scale rules, run as arithmetic.
//
// This is deliberately a pure rules engine, not a model call. The playbook
// states exact thresholds (spend vs median CPL, CTR decay, frequency), and the
// whole value of stating them is that the verdicts are reproducible: the same
// numbers always give the same answer, and the reason can be printed next to
// it. A model would give a different answer on Tuesday.
//
// It reads the daily rows the Meta sync already writes - no new data source,
// which means it improves automatically as the sync does, and it works today
// on every client that syncs.

// When no ad on the account has produced a lead yet, there is no median CPL to
// anchor to. $60 is the home-services Meta benchmark; it only governs the
// "enough spend to judge" gates, and stops mattering as soon as real leads land.
const FALLBACK_CPL = 60

// Judged windows.
const RECENT_DAYS = 7
const BASELINE_DAYS = 7

function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function sum(rows, field) {
  return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0)
}

function isLive(status) {
  return String(status || '').toUpperCase() === 'ACTIVE'
}

/**
 * Verdicts for every ad with data, most urgent first.
 *
 * Kill rules fire on any ONE condition, matching the playbook:
 *   - spend >= 3x median CPL with zero leads
 *   - CPL > 2x median after >= 5x median in spend
 *   - CTR down 30%+ from the ad's own early baseline (fatigue)
 * Watch: frequency past ~3, or CTR sliding 10%+ week over week.
 * Scale: CPL <= 0.7x median with 10+ leads.
 * Learning: not enough spend to say anything honest yet.
 */
export function diagnose(rows) {
  // Group the daily rows per ad.
  const byAd = new Map()
  for (const r of rows) {
    const list = byAd.get(r.ad_id) || []
    list.push(r)
    byAd.set(r.ad_id, list)
  }

  // Median CPL across ads that actually produced leads: the account's own bar.
  const cpls = []
  for (const adRows of byAd.values()) {
    const leads = sum(adRows, 'leads')
    if (leads > 0) cpls.push(sum(adRows, 'spend') / leads)
  }
  const medianCpl = median(cpls) ?? FALLBACK_CPL
  const usingFallback = cpls.length === 0

  const today = new Date()
  const daysAgo = (dateStr) => Math.floor((today - new Date(dateStr)) / 86400000)

  const verdicts = []

  for (const [adId, adRows] of byAd) {
    adRows.sort((a, b) => a.date.localeCompare(b.date))
    const latest = adRows[adRows.length - 1]

    const spend = sum(adRows, 'spend')
    const leads = sum(adRows, 'leads')
    const clicks = sum(adRows, 'clicks')
    const impressions = sum(adRows, 'impressions')
    const reach = sum(adRows, 'reach')
    const cpl = leads > 0 ? spend / leads : null
    const ctr = impressions > 0 ? clicks / impressions : null
    // Reach is per-day in ad_daily, so summing overstates uniques and
    // UNDERSTATES frequency - meaning this flag fires late, never early.
    // A conservative fatigue signal beats a jumpy one.
    const frequency = reach > 0 ? impressions / reach : null

    // CTR decay: this week vs the ad's own first week.
    const recentRows = adRows.filter((r) => daysAgo(r.date) < RECENT_DAYS)
    const firstDate = adRows[0].date
    const baselineRows = adRows.filter(
      (r) => (new Date(r.date) - new Date(firstDate)) / 86400000 < BASELINE_DAYS
    )
    const recentImp = sum(recentRows, 'impressions')
    const baseImp = sum(baselineRows, 'impressions')
    const recentCtr = recentImp > 0 ? sum(recentRows, 'clicks') / recentImp : null
    const baselineCtr = baseImp > 0 ? sum(baselineRows, 'clicks') / baseImp : null
    // Only meaningful once the windows are distinct and both have real volume.
    const ctrDecay =
      recentCtr !== null &&
      baselineCtr > 0 &&
      adRows.length > BASELINE_DAYS &&
      recentImp >= 500 &&
      baseImp >= 500
        ? 1 - recentCtr / baselineCtr
        : null

    const ad = {
      adId,
      name: latest.ad_name || adId,
      campaign: latest.campaign_name || '',
      live: isLive(latest.effective_status),
      days: adRows.length,
      spend,
      leads,
      cpl,
      ctr,
      frequency,
      ctrDecay,
    }

    // Paused ads get reported, not judged - there is nothing to act on.
    if (!ad.live) {
      verdicts.push({ ...ad, verdict: 'paused', reasons: [] })
      continue
    }

    // Not enough spend for an honest opinion. The playbook's floor.
    if (spend < 1.5 * medianCpl) {
      verdicts.push({
        ...ad,
        verdict: 'learning',
        reasons: [
          `$${spend.toFixed(0)} spent — under the $${(1.5 * medianCpl).toFixed(0)} floor (1.5× the account's $${medianCpl.toFixed(0)} CPL) for judging anything`,
        ],
      })
      continue
    }

    const reasons = []

    if (leads === 0 && spend >= 3 * medianCpl) {
      reasons.push(
        `$${spend.toFixed(0)} spent with zero leads — past 3× the account's $${medianCpl.toFixed(0)} CPL`
      )
    }
    if (cpl !== null && spend >= 5 * medianCpl && cpl > 2 * medianCpl) {
      reasons.push(
        `$${cpl.toFixed(0)} per lead against the account's $${medianCpl.toFixed(0)} — more than double, with enough spend to be sure`
      )
    }
    if (ctrDecay !== null && ctrDecay >= 0.3) {
      reasons.push(
        `Click rate down ${Math.round(ctrDecay * 100)}% from its own first week — fatigued, refresh the creative`
      )
    }

    if (reasons.length > 0) {
      verdicts.push({ ...ad, verdict: 'kill', reasons })
      continue
    }

    const watch = []
    if (frequency !== null && frequency > 3) {
      watch.push(
        `Frequency ~${frequency.toFixed(1)} — the same people are seeing it repeatedly; 1–2 weeks left`
      )
    }
    if (ctrDecay !== null && ctrDecay >= 0.1) {
      watch.push(`Click rate sliding — down ${Math.round(ctrDecay * 100)}% from its first week`)
    }
    if (watch.length > 0) {
      verdicts.push({ ...ad, verdict: 'watch', reasons: watch })
      continue
    }

    if (cpl !== null && cpl <= 0.7 * medianCpl && leads >= 10) {
      verdicts.push({
        ...ad,
        verdict: 'scale',
        reasons: [
          `$${cpl.toFixed(0)} per lead on ${leads} leads — 30%+ cheaper than the account's $${medianCpl.toFixed(0)}. Raise budget ≤20%, or clone the hook into a new format`,
        ],
      })
      continue
    }

    verdicts.push({ ...ad, verdict: 'ok', reasons: [] })
  }

  const order = { kill: 0, watch: 1, scale: 2, learning: 3, ok: 4, paused: 5 }
  verdicts.sort((a, b) => order[a.verdict] - order[b.verdict] || b.spend - a.spend)

  return { verdicts, medianCpl, usingFallback }
}

// Last 30 days of daily rows: enough to see fatigue develop, recent enough
// that a long-dead ad doesn't haunt the list.
export async function fetchAdDoctorData(clientId) {
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const sinceStr = since.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('ad_daily')
    .select(
      'ad_id, ad_name, campaign_name, effective_status, date, spend, impressions, reach, clicks, leads'
    )
    .eq('client_id', clientId)
    .gte('date', sinceStr)
  if (error) throw error
  return data || []
}

export const VERDICT_META = {
  kill: { label: 'Kill', cls: 'bg-red-100 text-red-800', hint: 'Pause it — the data is in.' },
  watch: {
    label: 'Watch',
    cls: 'bg-amber-100 text-amber-800',
    hint: 'Fatiguing. Get the replacement creative ready now.',
  },
  scale: {
    label: 'Scale',
    cls: 'bg-green-100 text-green-800',
    hint: 'Winner. Feed it carefully.',
  },
  learning: {
    label: 'Learning',
    cls: 'bg-blue-100 text-blue-800',
    hint: 'Not enough spend to judge. Leave it alone.',
  },
  ok: { label: 'Healthy', cls: 'bg-slate-100 text-slate-700', hint: 'Performing at par.' },
  paused: { label: 'Paused', cls: 'bg-slate-100 text-slate-400', hint: '' },
}
