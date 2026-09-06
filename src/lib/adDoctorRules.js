// The Ad Doctor's rules. Pure: scripts/check-ad-doctor.mjs imports this.
//
// Every threshold here is also written, with its source, in
// src/lib/metaKnowledge.js sections 5, 8 and 9. Change one, change both.
//
// What the doctor reads per ad, from ad_daily:
//   spend, leads, impressions, clicks, reach (per day, so summed reach
//   OVERSTATES uniques and the frequency proxy UNDERSTATES true frequency:
//   that flag fires late, never early), video plays, thruplays, 2-second views.
//
// What it produces per ad:
//   verdict   kill | watch | scale | learning | ok | paused
//   reasons   the arithmetic, one sentence each
//   cause     for a watch or kill on a former performer: 'creative' (CTR down,
//             CPM flat), 'market' (CPM up, CTR flat), 'both', or null
//   signals   retention and hook findings, when the data exists
//   prescription  the next move, format-aware, quoting the agency's own
//                 numbers when learnings are passed in
//
// And per ad set: leads in the last 7 days against Meta's 50-a-week bar, so
// nobody mistakes "learning limited" for "broken".

// When no ad on the account has produced a lead yet there is no median CPL to
// anchor to. $60 is the home-services Meta benchmark; it only governs the
// "enough spend to judge" gates and stops mattering once real leads land.
export const FALLBACK_CPL = 60

const RECENT_DAYS = 7
const BASELINE_DAYS = 7

// Fatigue and retention thresholds. [industry] figures, see metaKnowledge.js.
export const THRESHOLDS = {
  ctrDecayWatch: 0.1,
  ctrDecayKill: 0.3,
  ctrDecayFatigue: 0.15, // the earliest tell
  cpmRiseMarket: 0.2, // CPM up this much with CTR flat is the auction, not the ad
  ctrFlat: 0.1, // "flat" means moved less than this either way
  frequencyWatch: 3, // proxy understates, so 3 here is roughly 2.5 true
  holdRateReCut: 8, // % of plays reaching ThruPlay; benchmark 18 to 28
  holdRateBenchmark: [18, 28],
  hookRateWeak: 15, // % of impressions with a 2s+ view; benchmark ~25
  hookRateBenchmark: 25,
  minPlaysForRetention: 200,
  minImpressionsForTrend: 500,
  learningEventsPerWeek: 50,
}

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
  return ['ACTIVE', 'WITH_ISSUES'].includes(String(status || '').toUpperCase())
}

function pct(x) {
  return `${Math.round(x * 100)}%`
}

/**
 * Pulls the agency-wide numbers the prescriptions quote out of the nightly
 * learnings rows, when they are passed in. Everything is optional.
 */
function learningsFacts(learnings) {
  const rows = Array.isArray(learnings) ? learnings : []
  const fmt = rows.find((r) => r.scope === 'account' && r.kind === 'format_split')?.evidence
  const video = fmt?.video
  const image = fmt?.image
  const cpl = (x) => (x && Number(x.leads) > 0 ? Math.round(Number(x.spend) / Number(x.leads)) : null)
  return {
    videoCpl: cpl(video),
    imageCpl: cpl(image),
    imageZeroRate: image && Number(image.ads) > 0 ? Number(image.zero) / Number(image.ads) : null,
  }
}

function prescribe(ad, verdict, cause, facts) {
  const fmtNote =
    facts.videoCpl && facts.imageCpl
      ? ` Our own data: video $${facts.videoCpl} per lead against image $${facts.imageCpl}${
          facts.imageZeroRate != null ? `, and ${Math.round(facts.imageZeroRate * 100)}% of images produced nothing` : ''
        }.`
      : ''
  if (verdict === 'kill') {
    if (cause === 'market') {
      return `CPM is up while the click rate held, so the auction got dearer, not the ad. Check the calendar and the competition before replacing it; if the season explains it, hold or trim budget rather than kill.`
    }
    if (ad.leads === 0) {
      return `Pause it. Replace with a different ANGLE, not a variant: ${
        ad.isVideo ? 'a new open on the same offer, or a bigger offer' : 'a video, offer-led, with proof on screen'
      }.${fmtNote}`
    }
    return `Pause it and put the budget behind the account's cheapest lead. The replacement is a new concept in ${
      ad.isVideo ? 'video' : 'video rather than another still'
    }.${fmtNote}`
  }
  if (verdict === 'watch') {
    if (cause === 'market') {
      return `Not fatigue: CPM rose and the click rate did not move. Season or a competitor. Leave the creative, watch CPL for a week, and do not raise budget into a dearer auction.`
    }
    return `Fatigue is starting. Build the replacement now, ${
      ad.isVideo ? 'same offer, new first three seconds' : 'and make it a video if the client has footage'
    }, and swap before frequency passes 3. Do not edit this ad in place; that resets learning.`
  }
  if (verdict === 'scale') {
    return `Winner. Raise budget no more than 20% at a time, or duplicate the hook into ${
      ad.isVideo ? 'a still with the same headline' : 'a video open'
    } instead of raising budget at all. Never edit this ad.`
  }
  if (verdict === 'learning') {
    return `Too early to judge. Leave it alone until it has spent 1.5 times the account's cost per lead.`
  }
  return ''
}

/**
 * Verdicts for every ad with data, most urgent first, plus ad-set learning
 * status and account totals.
 *
 * rows: ad_daily rows for one client (30 days). opts.learnings: ad_learnings
 * rows, optional, used only to quote the agency's numbers in prescriptions.
 * opts.today: for tests.
 */
export function diagnoseAds(rows, opts = {}) {
  const T = THRESHOLDS
  const facts = learningsFacts(opts.learnings)
  const today = opts.today ? new Date(opts.today) : new Date()
  const daysAgo = (dateStr) => Math.floor((today - new Date(dateStr)) / 86400000)

  const byAd = new Map()
  for (const r of rows) {
    const list = byAd.get(r.ad_id) || []
    list.push(r)
    byAd.set(r.ad_id, list)
  }

  const cpls = []
  for (const adRows of byAd.values()) {
    const leads = sum(adRows, 'leads')
    if (leads > 0) cpls.push(sum(adRows, 'spend') / leads)
  }
  const medianCpl = median(cpls) ?? FALLBACK_CPL
  const usingFallback = cpls.length === 0

  // Ad sets: leads in the last 7 days against the learning bar.
  const byAdset = new Map()
  for (const r of rows) {
    if (!r.adset_id) continue
    const s = byAdset.get(r.adset_id) || { adsetId: r.adset_id, name: r.adset_name || r.adset_id, leads7: 0, spend7: 0, live: false }
    if (daysAgo(r.date) < 7) {
      s.leads7 += Number(r.leads) || 0
      s.spend7 += Number(r.spend) || 0
    }
    if (isLive(r.effective_status)) s.live = true
    byAdset.set(r.adset_id, s)
  }
  const adsets = [...byAdset.values()]
    .filter((s) => s.live)
    .map((s) => ({
      ...s,
      learningLimited: s.leads7 < T.learningEventsPerWeek,
      note:
        s.leads7 < T.learningEventsPerWeek
          ? `${s.leads7} lead${s.leads7 === 1 ? '' : 's'} in 7 days against the ~50 Meta needs to leave learning. Learning limited is normal at this budget: judge on 7 to 14 day trend, not day to day, and do not add or remove ads more than once a week.`
          : `${s.leads7} leads in 7 days: out of learning. Numbers are stable enough to act on.`,
    }))

  const verdicts = []

  for (const [adId, adRows] of byAd) {
    adRows.sort((a, b) => a.date.localeCompare(b.date))
    const latest = adRows[adRows.length - 1]

    const spend = sum(adRows, 'spend')
    const leads = sum(adRows, 'leads')
    const clicks = sum(adRows, 'clicks')
    const impressions = sum(adRows, 'impressions')
    const reach = sum(adRows, 'reach')
    const plays = sum(adRows, 'video_plays')
    const thru = sum(adRows, 'video_thruplays')
    const v2s = sum(adRows, 'video_2s_views')
    const hasThru = adRows.some((r) => r.video_thruplays != null)
    const hasV2s = adRows.some((r) => r.video_2s_views != null)

    const cpl = leads > 0 ? spend / leads : null
    const ctr = impressions > 0 ? clicks / impressions : null
    const cpm = impressions > 0 ? (1000 * spend) / impressions : null
    const frequency = reach > 0 ? impressions / reach : null
    const isVideo = impressions > 0 && plays > 0.05 * impressions
    const holdRate = isVideo && hasThru && plays > 0 ? (100 * thru) / plays : null
    const hookRate = isVideo && hasV2s && impressions > 0 ? (100 * v2s) / impressions : null

    // This week vs the ad's own first week, for CTR; this week vs the week
    // before, for CPM (the auction moves faster than the creative ages).
    const recentRows = adRows.filter((r) => daysAgo(r.date) < RECENT_DAYS)
    const priorRows = adRows.filter((r) => daysAgo(r.date) >= RECENT_DAYS && daysAgo(r.date) < RECENT_DAYS * 2)
    const firstDate = adRows[0].date
    const baselineRows = adRows.filter((r) => (new Date(r.date) - new Date(firstDate)) / 86400000 < BASELINE_DAYS)
    const recentImp = sum(recentRows, 'impressions')
    const baseImp = sum(baselineRows, 'impressions')
    const priorImp = sum(priorRows, 'impressions')
    const recentCtr = recentImp > 0 ? sum(recentRows, 'clicks') / recentImp : null
    const baselineCtr = baseImp > 0 ? sum(baselineRows, 'clicks') / baseImp : null
    const ctrDecay =
      recentCtr !== null && baselineCtr > 0 && adRows.length > BASELINE_DAYS && recentImp >= T.minImpressionsForTrend && baseImp >= T.minImpressionsForTrend
        ? 1 - recentCtr / baselineCtr
        : null
    const recentCpm = recentImp > 0 ? (1000 * sum(recentRows, 'spend')) / recentImp : null
    const priorCpm = priorImp > 0 ? (1000 * sum(priorRows, 'spend')) / priorImp : null
    const cpmChange =
      recentCpm !== null && priorCpm > 0 && recentImp >= T.minImpressionsForTrend && priorImp >= T.minImpressionsForTrend
        ? recentCpm / priorCpm - 1
        : null

    // Attribution: is a slide the creative or the auction?
    let cause = null
    if (ctrDecay !== null || cpmChange !== null) {
      const ctrDown = ctrDecay !== null && ctrDecay >= T.ctrDecayFatigue
      const ctrFlat = ctrDecay === null || Math.abs(ctrDecay) < T.ctrFlat
      const cpmUp = cpmChange !== null && cpmChange >= T.cpmRiseMarket
      if (ctrDown && cpmUp) cause = 'both'
      else if (ctrDown) cause = 'creative'
      else if (cpmUp && ctrFlat) cause = 'market'
    }

    const signals = []
    if (holdRate !== null && plays >= T.minPlaysForRetention) {
      if (holdRate < T.holdRateReCut) {
        signals.push(
          `Holds ${holdRate.toFixed(1)}% of plays to ThruPlay (cold-traffic benchmark ${T.holdRateBenchmark[0]} to ${T.holdRateBenchmark[1]}%). The clip loses people before the offer: re-cut, do not re-budget.`
        )
      } else if (holdRate >= T.holdRateBenchmark[0]) {
        signals.push(`Holds ${holdRate.toFixed(1)}% to ThruPlay, inside the ${T.holdRateBenchmark[0]} to ${T.holdRateBenchmark[1]}% benchmark.`)
      }
    }
    if (hookRate !== null && impressions >= 1000 && hookRate < T.hookRateWeak) {
      signals.push(`Hook rate ${hookRate.toFixed(1)}%: fewer than ${T.hookRateWeak} in 100 people watch past the first two seconds (benchmark about ${T.hookRateBenchmark}%). The first frame is not stopping the thumb.`)
    }
    if (cause === 'market') {
      signals.push(`CPM up ${pct(cpmChange)} week over week with click rate flat: the auction got dearer, not the ad.`)
    }

    const ad = {
      adId,
      name: latest.ad_name || adId,
      campaign: latest.campaign_name || '',
      adsetId: latest.adset_id || null,
      live: isLive(latest.effective_status),
      days: adRows.length,
      spend,
      leads,
      cpl,
      ctr,
      cpm,
      frequency,
      ctrDecay,
      cpmChange,
      isVideo,
      holdRate,
      hookRate,
      cause,
      signals,
    }

    const push = (verdict, reasons) =>
      verdicts.push({ ...ad, verdict, reasons, prescription: prescribe(ad, verdict, cause, facts) })

    if (!ad.live) {
      push('paused', [])
      continue
    }

    if (spend < 1.5 * medianCpl) {
      push('learning', [
        `$${spend.toFixed(0)} spent, under the $${(1.5 * medianCpl).toFixed(0)} floor (1.5x the account's $${medianCpl.toFixed(0)} CPL) for judging anything`,
      ])
      continue
    }

    const reasons = []
    if (leads === 0 && spend >= 3 * medianCpl) {
      reasons.push(`$${spend.toFixed(0)} spent with zero leads, past 3x the account's $${medianCpl.toFixed(0)} CPL`)
    }
    if (cpl !== null && spend >= 5 * medianCpl && cpl > 2 * medianCpl) {
      reasons.push(`$${cpl.toFixed(0)} per lead against the account's $${medianCpl.toFixed(0)}: more than double, with enough spend to be sure`)
    }
    if (ctrDecay !== null && ctrDecay >= T.ctrDecayKill) {
      reasons.push(`Click rate down ${pct(ctrDecay)} from its own first week: fatigued, refresh the creative`)
    }
    if (reasons.length > 0) {
      push('kill', reasons)
      continue
    }

    const watch = []
    if (frequency !== null && frequency > T.frequencyWatch) {
      watch.push(`Frequency about ${frequency.toFixed(1)} (understated by the daily proxy, so true frequency is higher): the same people are seeing it repeatedly; 1 to 2 weeks left`)
    }
    if (ctrDecay !== null && ctrDecay >= T.ctrDecayWatch) {
      watch.push(`Click rate sliding, down ${pct(ctrDecay)} from its first week${cause === 'creative' ? ' with CPM flat: the creative is tiring' : ''}`)
    }
    if (cause === 'market' && cpl !== null && cpl > medianCpl) {
      watch.push(`Cost per lead $${cpl.toFixed(0)} against $${medianCpl.toFixed(0)}, driven by a ${pct(cpmChange)} CPM rise rather than the ad`)
    }
    if (watch.length > 0) {
      push('watch', watch)
      continue
    }

    if (cpl !== null && cpl <= 0.7 * medianCpl && leads >= 10) {
      push('scale', [
        `$${cpl.toFixed(0)} per lead on ${leads} leads, 30%+ cheaper than the account's $${medianCpl.toFixed(0)}`,
      ])
      continue
    }

    push('ok', [])
  }

  const order = { kill: 0, watch: 1, scale: 2, learning: 3, ok: 4, paused: 5 }
  verdicts.sort((a, b) => order[a.verdict] - order[b.verdict] || b.spend - a.spend)

  const live = verdicts.filter((v) => v.live)
  const account = {
    spend: sum(rows, 'spend'),
    leads: sum(rows, 'leads'),
    impressions: sum(rows, 'impressions'),
    clicks: sum(rows, 'clicks'),
    liveAds: live.length,
  }
  account.cpl = account.leads > 0 ? account.spend / account.leads : null
  account.ctr = account.impressions > 0 ? account.clicks / account.impressions : null
  account.cpm = account.impressions > 0 ? (1000 * account.spend) / account.impressions : null

  return { verdicts, medianCpl, usingFallback, adsets, account }
}

/**
 * The verdict table as text, for the "Full diagnosis" prompt. Every number the
 * rules used, so the model reasons from the same arithmetic the screen shows.
 */
export function verdictsForPrompt(result) {
  const lines = []
  const a = result.account
  lines.push(
    `ACCOUNT, LAST 30 DAYS: $${a.spend.toFixed(0)} spent, ${a.leads} leads, ${a.cpl != null ? `$${a.cpl.toFixed(0)}` : 'no'} per lead, ${
      a.ctr != null ? (a.ctr * 100).toFixed(2) : 'n/a'
    }% CTR, $${a.cpm != null ? a.cpm.toFixed(1) : 'n/a'} CPM, ${a.liveAds} live ads. Median CPL used as the bar: $${result.medianCpl.toFixed(0)}${
      result.usingFallback ? ' (industry fallback, no leads yet)' : ''
    }.`
  )
  for (const s of result.adsets) lines.push(`AD SET "${s.name}": ${s.note}`)
  for (const v of result.verdicts) {
    if (v.verdict === 'paused') continue
    lines.push(
      `[${v.verdict.toUpperCase()}] "${v.name}" (${v.isVideo ? 'video' : 'image'}, ${v.days} days): $${v.spend.toFixed(0)}, ${v.leads} leads, ${
        v.cpl != null ? `$${v.cpl.toFixed(0)}/lead` : 'no leads'
      }, CTR ${v.ctr != null ? (v.ctr * 100).toFixed(2) : 'n/a'}%, CPM $${v.cpm != null ? v.cpm.toFixed(1) : 'n/a'}, frequency ${
        v.frequency != null ? v.frequency.toFixed(1) : 'n/a'
      }${v.ctrDecay != null ? `, CTR vs first week ${v.ctrDecay >= 0 ? '-' : '+'}${Math.abs(Math.round(v.ctrDecay * 100))}%` : ''}${
        v.cpmChange != null ? `, CPM week over week ${v.cpmChange >= 0 ? '+' : ''}${Math.round(v.cpmChange * 100)}%` : ''
      }${v.holdRate != null ? `, ThruPlay hold ${v.holdRate.toFixed(1)}%` : ''}${v.hookRate != null ? `, hook rate ${v.hookRate.toFixed(1)}%` : ''}${
        v.cause ? `, cause: ${v.cause}` : ''
      }. ${[...v.reasons, ...v.signals].join(' ')}`
    )
  }
  return lines.join('\n')
}

export const VERDICT_META = {
  kill: { label: 'Kill', cls: 'bg-red-100 text-red-800', hint: 'Pause it. The data is in.' },
  watch: { label: 'Watch', cls: 'bg-amber-100 text-amber-800', hint: 'Fatiguing. Get the replacement creative ready now.' },
  scale: { label: 'Scale', cls: 'bg-green-100 text-green-800', hint: 'Winner. Feed it carefully.' },
  learning: { label: 'Learning', cls: 'bg-blue-100 text-blue-800', hint: 'Not enough spend to judge. Leave it alone.' },
  ok: { label: 'Healthy', cls: 'bg-slate-100 text-slate-700', hint: 'Performing at par.' },
  paused: { label: 'Paused', cls: 'bg-slate-100 text-slate-400', hint: '' },
}
