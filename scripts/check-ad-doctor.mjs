// Self-check for the Ad Doctor's rules. Run: node scripts/check-ad-doctor.mjs
//
// The rule: THE SAME NUMBERS ALWAYS GIVE THE SAME VERDICT, THE REASON IS
// PRINTED, AND A COST RISE IS BLAMED ON THE CREATIVE OR ON THE AUCTION, NOT
// ON WHICHEVER COMES TO MIND. Fixtures are built as daily rows, the way the
// sync writes them, so the windows (first week, last 7 days, the 7 before)
// are exercised for real.

import { THRESHOLDS, diagnoseAds, verdictsForPrompt } from '../src/lib/adDoctorRules.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const TODAY = '2026-09-06'
function day(offset) {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().slice(0, 10)
}

// n days of rows ending yesterday, oldest first. `f(i)` returns the day's
// numbers where i = 0 is the first day the ad ran.
function series(ad, n, f) {
  const rows = []
  for (let i = 0; i < n; i++) {
    const v = f(i)
    rows.push({
      ad_id: ad.id,
      ad_name: ad.name,
      campaign_name: 'C',
      adset_id: ad.adset || 'set1',
      adset_name: ad.adset || 'set1',
      effective_status: ad.status || 'ACTIVE',
      date: day(n - i),
      spend: v.spend,
      impressions: v.imp,
      reach: v.reach ?? Math.round(v.imp * 0.7),
      clicks: v.clicks,
      leads: v.leads ?? 0,
      video_plays: v.plays ?? null,
      video_thruplays: v.thru ?? null,
      video_2s_views: v.v2s ?? null,
    })
  }
  return rows
}
const one = (rows, id) => diagnoseAds(rows, { today: TODAY }).verdicts.find((v) => v.adId === id)

// A healthy anchor ad so the account has a median CPL of about $40.
const anchor = series({ id: 'anchor', name: 'Anchor' }, 20, () => ({ spend: 40, imp: 1500, clicks: 40, leads: 1 }))

// --- kill rules -----------------------------------------------------------------

const dead = series({ id: 'dead', name: 'Dead' }, 10, () => ({ spend: 20, imp: 1000, clicks: 12, leads: 0 }))
check('zero leads past 3x median: kill', one([...anchor, ...dead], 'dead').verdict, 'kill')
check('and the reason names the spend and the bar', /\$200 spent with zero leads, past 3x/.test(one([...anchor, ...dead], 'dead').reasons[0]), true)
check('a dead image is prescribed a video with proof', /video, offer-led, with proof/.test(one([...anchor, ...dead], 'dead').prescription), true)

// --- fatigue: creative vs market -------------------------------------------------

// CTR halves from the first week to the last, CPM flat: the creative.
const tired = series({ id: 'tired', name: 'Tired' }, 21, (i) => ({
  spend: 30, imp: 1000, clicks: i < 7 ? 30 : i < 14 ? 22 : 15, leads: 1,
}))
const t = one([...anchor, ...tired], 'tired')
check('CTR down 50% from its first week: kill', t.verdict, 'kill')
check('cause is the creative', t.cause, 'creative')
check('kill reason says fatigued', /fatigued/.test(t.reasons[0]), true)

// CTR flat, CPM up 40% in the last week: the auction, not the ad. Leads get
// dearer, but the ad is told to hold, not to die.
// Rows run from 21 days ago to yesterday, so i = 15..20 is the last 7 days and
// i = 8..14 the 7 before.
const market = series({ id: 'market', name: 'Market' }, 21, (i) => ({
  spend: i < 15 ? 30 : 42, imp: 1000, clicks: 25, leads: i < 15 ? 1 : 0,
}))
const m = one([...anchor, ...market], 'market')
check('CPM up, CTR flat: cause is the market', m.cause, 'market')
check('and it is a watch, not a kill', m.verdict, 'watch')
check('the watch reason names the CPM rise', /CPM rise rather than the ad/.test(m.reasons.join(' ')), true)
check('the prescription says not fatigue', /Not fatigue/.test(m.prescription), true)
check('the signal quotes the CPM change', /CPM up 40%/.test(m.signals.join(' ')), true)

// Both moving: both.
const both = series({ id: 'both', name: 'Both' }, 21, (i) => ({
  spend: i < 15 ? 30 : 40, imp: 1000, clicks: i < 7 ? 30 : i < 15 ? 26 : 22, leads: 1,
}))
check('CTR down and CPM up: both', one([...anchor, ...both], 'both').cause, 'both')

// --- retention signals --------------------------------------------------------------

const leaky = series({ id: 'leaky', name: 'Leaky video' }, 10, () => ({
  spend: 40, imp: 2000, clicks: 40, leads: 1, plays: 1500, thru: 60, v2s: 200,
}))
const l = one([...anchor, ...leaky], 'leaky')
check('a video is recognised as video', l.isVideo, true)
check('hold rate is computed', l.holdRate, 4)
check('4% hold is flagged for a re-cut', /re-cut, do not re-budget/.test(l.signals.join(' ')), true)
check('10% hook rate is flagged', /Hook rate 10\.0%/.test(l.signals.join(' ')), true)

const holds = series({ id: 'holds', name: 'Holding video' }, 10, () => ({
  spend: 40, imp: 2000, clicks: 40, leads: 1, plays: 1500, thru: 330, v2s: 700,
}))
check('22% hold is inside the benchmark', /inside the 18 to 28% benchmark/.test(one([...anchor, ...holds], 'holds').signals.join(' ')), true)

const tiny = series({ id: 'tiny', name: 'Tiny video' }, 3, () => ({ spend: 5, imp: 50, clicks: 1, leads: 0, plays: 30, thru: 1 }))
check('too few plays: no retention verdict', one([...anchor, ...tiny], 'tiny').signals, [])

// --- scale, learning, paused --------------------------------------------------------

// $15 a lead against the anchor's $40: median $27.50, 0.7x is $19.25.
const star = series({ id: 'star', name: 'Star' }, 15, () => ({ spend: 15, imp: 1000, clicks: 30, leads: 1 }))
const s = one([...anchor, ...star], 'star')
check('cheap and proven: scale', s.verdict, 'scale')
check('scale prescription caps the raise at 20%', /no more than 20%/.test(s.prescription), true)

const young = series({ id: 'young', name: 'Young' }, 2, () => ({ spend: 20, imp: 500, clicks: 5, leads: 0 }))
check('under the spend floor: learning', one([...anchor, ...young], 'young').verdict, 'learning')

const off = series({ id: 'off', name: 'Off', status: 'PAUSED' }, 10, () => ({ spend: 30, imp: 1000, clicks: 10, leads: 0 }))
check('paused is reported, not judged', one([...anchor, ...off], 'off').verdict, 'paused')

// --- ad sets and learning limited -------------------------------------------------------

const r = diagnoseAds([...anchor, ...star], { today: TODAY })
check('one live ad set reported', r.adsets.length, 1)
check('14 leads in 7 days is learning limited', r.adsets[0].learningLimited, true)
check('the note says what learning limited means', /judge on 7 to 14 day trend/.test(r.adsets[0].note), true)

const busy = series({ id: 'busy', name: 'Busy', adset: 'big' }, 10, () => ({ spend: 400, imp: 20000, clicks: 400, leads: 9 }))
check('63 leads in 7 days is out of learning', diagnoseAds(busy, { today: TODAY }).adsets[0].learningLimited, false)

// --- account totals and the prompt table -------------------------------------------------

check('account totals are summed', r.account.leads, 35)
check('median CPL sits between the anchor and the star', r.medianCpl, 27.5)
const text = verdictsForPrompt(diagnoseAds([...anchor, ...market, ...leaky], { today: TODAY }))
check('prompt table starts with the account line', /^ACCOUNT, LAST 30 DAYS/.test(text), true)
check('prompt table carries the ad set learning note', /AD SET "set1"/.test(text), true)
check('prompt table tags each verdict', /\[WATCH\] "Market"/.test(text), true)
check('prompt table carries cause and hold rate', /cause: market/.test(text) && /ThruPlay hold 4\.0%/.test(text), true)

// --- learnings make the prescription quote our numbers --------------------------------------

const learnings = [{ scope: 'account', kind: 'format_split', evidence: { video: { spend: 10000, leads: 270, ads: 14, zero: 1 }, image: { spend: 8000, leads: 150, ads: 26, zero: 7 } } }]
const withL = diagnoseAds([...anchor, ...dead], { today: TODAY, learnings }).verdicts.find((v) => v.adId === 'dead')
check('prescription quotes video vs image CPL from the learnings', /video \$37 per lead against image \$53/.test(withL.prescription), true)
check('and the image zero rate', /27% of images produced nothing/.test(withL.prescription), true)

// --- thresholds stay in step with the knowledge base ----------------------------------------------

check('fatigue watch at 10%, kill at 30%', [THRESHOLDS.ctrDecayWatch, THRESHOLDS.ctrDecayKill], [0.1, 0.3])
check('re-cut under 8% hold, benchmark 18 to 28', [THRESHOLDS.holdRateReCut, ...THRESHOLDS.holdRateBenchmark], [8, 18, 28])
check('learning bar is 50 a week', THRESHOLDS.learningEventsPerWeek, 50)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll ad-doctor checks pass')
process.exit(failures ? 1 : 0)
