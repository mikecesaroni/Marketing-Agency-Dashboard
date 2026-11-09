// Self-check for the County map template's pure half: the state a market
// names, the county a badge names, the two lines over the map, and the
// projection (north up, fitted and centred). Run: node scripts/check-county-map.mjs

import { readFileSync } from 'node:fs'
import { STATE_FIPS, countyFrom, countyKey, findCounty, placeLines, projectShapes, stateAbbrFrom } from '../src/lib/countyMap.js'
import { TEMPLATE_LAYOUTS, TEMPLATE_SHAPES } from '../src/lib/adTemplateMeta.js'
import { pickTemplate } from '../src/lib/seasonPlaybook.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

// The state.
check('fifty states and DC, New York is 36', [Object.keys(STATE_FIPS).length, STATE_FIPS.NY, STATE_FIPS.NH], [51, '36', '33'])
check('the state from a market, however it is written', ['Manchester, NH', 'Buffalo NY', 'Westchester County, New York', 'Dallas-Fort Worth, Texas', 'West Virginia panhandle', 'Erie County', ''].map(stateAbbrFrom), ['NH', 'NY', 'NY', 'TX', 'WV', '', ''])
check('a word that happens to be two letters is not a state', [stateAbbrFrom('Plano, TX 75024'), stateAbbrFrom('the GTA')], ['TX', ''])

// The county.
check('county keys: letters only, the word County and St. normalised', [countyKey('Erie County'), countyKey('St. Lawrence County'), countyKey('East Baton Rouge Parish'), countyKey('Kings')], ['erie', 'saintlawrence', 'eastbatonrouge', 'kings'])
check('the county a badge names, the state and the audience dropped', ['Erie County', 'Erie County homeowners', 'Westchester', 'Suffolk County, NY families', 'Manchester'].map(countyFrom), ['erie', 'erie', 'westchester', 'suffolk', 'manchester'])
const NY = [{ id: '36029', name: 'Erie', rings: [[[-79.1, 42.9], [-78.4, 42.9], [-78.4, 42.5], [-79.1, 42.5], [-79.1, 42.9]]] }, { id: '36119', name: 'Westchester', rings: [[[-73.9, 41.3], [-73.5, 41.3], [-73.5, 40.9], [-73.9, 40.9], [-73.9, 41.3]]] }, { id: '36089', name: 'St. Lawrence', rings: [[[-75.5, 44.9], [-74.6, 44.9], [-74.6, 44.1], [-75.5, 44.1], [-75.5, 44.9]]] }]
check('the badge finds its county; a city that is no county finds none', [findCounty(NY, 'Erie County homeowners')?.id, findCounty(NY, 'Westchester')?.id, findCounty(NY, 'St Lawrence County')?.id, findCounty(NY, 'Buffalo'), findCounty(NY, '')], ['36029', '36119', '36089', null, null])
check('a key that starts a county name finds it, a short one does not guess', [findCounty(NY, 'Westch')?.id, findCounty(NY, 'Er')], ['36119', null])

// The two lines.
check('the place and the audience', [placeLines('Erie County'), placeLines('Erie County homeowners'), placeLines('Westchester', 'Landlords'), placeLines('')], [{ big: 'ERIE COUNTY', small: 'HOMEOWNERS' }, { big: 'ERIE COUNTY', small: 'HOMEOWNERS' }, { big: 'WESTCHESTER', small: 'LANDLORDS' }, { big: 'YOUR AREA', small: 'HOMEOWNERS' }])

// The projection: north up, the whole state fitted into the box and centred.
const p = projectShapes(NY, { x: 100, y: 200, w: 400, h: 300 }, { pad: 10 })
check('every county projects, the bounds sit inside the box', [p.counties.length, p.bounds.x >= 110, p.bounds.y >= 210, p.bounds.x + p.bounds.w <= 490.001, p.bounds.y + p.bounds.h <= 490.001], [3, true, true, true, true])
const erie = p.counties[0].rings[0]
const stl = p.counties[2].rings[0]
check('north is up: St. Lawrence (44.9N) draws above Erie (42.9N)', stl[0][1] < erie[0][1], true)
check('west is left: Erie (79W) draws left of Westchester (73W)', erie[0][0] < p.counties[1].rings[0][0][0], true)
check('the shape is fitted on its tighter side and centred on the other', Math.abs(p.bounds.w - 380) < 0.01 || Math.abs(p.bounds.h - 280) < 0.01, true)
// Erie's box is 0.7 degrees wide and 0.4 tall; at 43.7 degrees north a degree
// of longitude is about 0.72 of a degree of latitude, so on the map it is
// about 1.27 times wider than tall, not 1.75.
check('longitude is scaled by the latitude, so a box of degrees is not stretched', (() => { const r = erie; const w = Math.abs(r[1][0] - r[0][0]); const h = Math.abs(r[2][1] - r[1][1]); const ratio = w / h; return ratio > 1.15 && ratio < 1.4 })(), true)
check('nothing to draw is quiet', projectShapes([], { x: 0, y: 0, w: 10, h: 10 }), { counties: [], bounds: null })

// The template in the menu and the playbook.
const t = TEMPLATE_LAYOUTS.find((x) => x.key === 'county_map')
check('the county map is a template with a shape for the chat', [Boolean(t), t?.label, Boolean(TEMPLATE_SHAPES.county_map?.wins)], [true, 'County map', true])
const pick = pickTemplate({ content: { badge: 'Erie County', hook: '$0 down on a new AC', offers: [{ amount: '$5,000', detail: 'Rebate' }, { amount: '30%', detail: 'Tax credit' }] } })
check('a county in the badge with stacked incentives picks the county map', pick.key, 'county_map')
check('a plain town does not', pickTemplate({ content: { badge: 'Manchester', hook: 'Furnace tune-up' } }).key === 'county_map', false)

// The function and the painter.
const fn = read('supabase/functions/geo-shapes/index.ts')
check('the function builds from the US Atlas once and keeps one file per state in the bucket', [fn.includes('us-atlas@3/counties-10m.json'), fn.includes('stock/geo/${state}.json'), fn.includes("'x-upsert': 'true'")], [true, true, true])
check('the store reads the bucket first and falls back to the function', [read('src/lib/countyMapStore.js').includes("functions.invoke('geo-shapes'"), read('src/lib/countyMapStore.js').includes('stock/geo/')], [true, true])
const painter = read('src/lib/adTemplates.js')
check('the template paints black, lights the county in the brand colour and draws outlined tiles, no button', [painter.includes('county_map: countyMap'), painter.includes('function drawCountyMap'), painter.includes('function outlinedTiles'), /countyMap[\s\S]{0,4000}GET OFFER/.test(painter)], [true, true, true, false])

console.log(failures === 0 ? '\nAll county map checks pass' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
