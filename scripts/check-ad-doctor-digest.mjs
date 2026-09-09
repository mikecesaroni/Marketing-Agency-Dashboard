// Self-check for the dashboard's Ad Doctor digest. Run:
//
//   node scripts/check-ad-doctor-digest.mjs
//
// The rule: THE DASHBOARD SHOWS EXACTLY THE KILL AND SCALE VERDICTS THE
// CLIENT PAGE WOULD, ONE CLIENT NEVER LEAKS INTO ANOTHER'S MEDIAN, AND
// INTERNAL BUSINESSES STAY OFF THE BOARD.

import { digestAdDoctor, digestCounts, digestHeadline, digestNumbers } from '../src/lib/adDoctorDigest.js'
import { diagnoseAds } from '../src/lib/adDoctorRules.js'

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
function series(client, ad, n, f) {
  const rows = []
  for (let i = 0; i < n; i++) {
    const v = f(i)
    rows.push({
      client_id: client.id,
      clients: { name: client.name, is_internal: !!client.internal },
      ad_id: ad.id,
      ad_name: ad.name,
      campaign_name: 'C',
      adset_id: 'set1',
      adset_name: 'set1',
      effective_status: ad.status || 'ACTIVE',
      date: day(n - i),
      spend: v.spend,
      impressions: v.imp,
      reach: Math.round(v.imp * 0.7),
      clicks: v.clicks,
      leads: v.leads ?? 0,
      video_plays: null,
      video_thruplays: null,
      video_2s_views: null,
    })
  }
  return rows
}

const titos = { id: 'c1', name: "Tito's" }
const belk = { id: 'c2', name: 'Belk' }
const wcm = { id: 'c9', name: 'Working Class', internal: true }

// Tito's: an anchor (median ~$40), a dead ad, a winner.
const anchor = series(titos, { id: 'a', name: 'Anchor' }, 20, () => ({ spend: 40, imp: 1500, clicks: 40, leads: 1 }))
const dead = series(titos, { id: 'd', name: 'Dead' }, 10, () => ({ spend: 20, imp: 1000, clicks: 12, leads: 0 }))
const winner = series(titos, { id: 'w', name: 'Winner' }, 20, () => ({ spend: 20, imp: 1500, clicks: 45, leads: 1 }))
// Belk: only a healthy ad, nothing to report.
const belkOk = series(belk, { id: 'b', name: 'Belk ok' }, 20, () => ({ spend: 40, imp: 1500, clicks: 40, leads: 1 }))
// Internal: a dead ad that must not show.
const wcmDead = series(wcm, { id: 'x', name: 'Ours' }, 10, () => ({ spend: 200, imp: 1000, clicks: 12, leads: 0 }))

const rows = [...anchor, ...dead, ...winner, ...belkOk, ...wcmDead]
const items = digestAdDoctor(rows, { today: TODAY })

check('kill and scale only, kill first', items.map((i) => [i.clientName, i.name, i.verdict]), [
  ["Tito's", 'Dead', 'kill'],
  ["Tito's", 'Winner', 'scale'],
])
check('the internal business is off the board', items.some((i) => i.clientId === 'c9'), false)
check('Belk, all healthy, is absent', items.some((i) => i.clientId === 'c2'), false)
check('a reason is carried for the row', items[0].reason.includes('zero leads'), true)
check('the prescription is carried', typeof items[0].prescription === 'string' && items[0].prescription.length > 0, true)

// Same verdicts the client page would show for Tito's alone.
const solo = diagnoseAds([...anchor, ...dead, ...winner], { today: TODAY }).verdicts.filter((v) => v.verdict === 'kill' || v.verdict === 'scale')
check('matches the client page verdicts', items.map((i) => [i.adId, i.verdict]), solo.map((v) => [v.adId, v.verdict]))

// Medians are per client: Belk's $40 must not lift or lower Tito's bar.
check("median is Tito's own", Math.round(items[0].medianCpl), Math.round(diagnoseAds([...anchor, ...dead, ...winner], { today: TODAY }).medianCpl))

check('counts', digestCounts(items), { kill: 1, scale: 1, clients: 1 })
check('headline, both kinds', digestHeadline(items), '1 ad to kill, 1 to scale')
check('headline, kills only', digestHeadline(items.filter((i) => i.verdict === 'kill')), '1 ad to kill')
check('headline, scales only', digestHeadline(items.filter((i) => i.verdict === 'scale')), '1 ad to scale')
check('headline, nothing', digestHeadline([]), '')
check('numbers line', digestNumbers({ spend: 200, leads: 0, cpl: null, medianCpl: 40, usingFallback: false }), '$200 spent, 0 leads, no leads · account median $40')
check('numbers line, one lead', digestNumbers({ spend: 100, leads: 1, cpl: 100, medianCpl: 60, usingFallback: true }), '$100 spent, 1 lead, $100/lead · account median $60 (fallback)')

// Bigger spend sorts first within a verdict, across clients.
const belkDead = series(belk, { id: 'bd', name: 'Belk dead' }, 10, () => ({ spend: 50, imp: 1000, clicks: 12, leads: 0 }))
const two = digestAdDoctor([...rows, ...belkDead], { today: TODAY })
check('within kills, biggest spend first', two.filter((i) => i.verdict === 'kill').map((i) => i.name), ['Belk dead', 'Dead'])

check('empty input', digestAdDoctor([], {}), [])
check('rows without a client are skipped', digestAdDoctor([{ ad_id: 'z', date: day(1), spend: 500 }], {}), [])

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
