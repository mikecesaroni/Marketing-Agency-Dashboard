// Geo targeting: people who LIVE somewhere, not people passing through.
//
// This check exists because of one lead. Summit Water Pros got an enquiry from
// Sacramento, three hours from their service area, off an ad set whose cities
// were seven Contra Costa towns at a 10-mile radius. The targeting looked
// perfect. The problem was a field nobody had set:
//
//   "location_types": ["home", "recent"]
//
// That is Meta's default when you omit it, and "recent" means anyone recently
// in the area. Sacramento to Walnut Creek is an ordinary day trip, so a visitor
// saw the ad, tapped the instant form, and the form prefilled the address off
// their Facebook profile. Nothing malfunctioned. The ad set did exactly what it
// was told.
//
// A sweep of the live account found every active ad set across every client the
// same way -- Belk, Comfort Experts, MBD, Reliable and Summit -- because both
// of the CRM's targeting builders omitted the field. For a trade where the
// buyer has to live at the property, "recent" can only ever buy visitors.
//
// The reason this needs a check rather than just a fix: it is silent. A wrong
// radius shows up as a strange audience size, but this looks identical to
// correct targeting in Ads Manager and only surfaces weeks later as a lead
// somebody has to politely turn away.
//
// Run with: node scripts/check-targeting.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`PASS  ${name}`)
  else {
    failures++
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// Both builders, because the Studio publishes through one and the chat creates
// ad sets through the other. If they disagree, the same client gets different
// targeting depending on which door the work came through.
const BUILDERS = [
  {
    file: 'supabase/functions/meta-publish/index.ts',
    what: 'the publish flow (Ad Studio)',
  },
  {
    file: 'supabase/functions/meta-manage/index.ts',
    what: 'create_adset (the chat)',
  },
]

for (const builder of BUILDERS) {
  const src = read(builder.file)
  const assignments = [...src.matchAll(/location_types\s*=\s*(\[[^\]]*\])/g)].map((m) => m[1])

  check(
    `${builder.what} sets location_types at all`,
    assignments.length > 0,
    'Meta defaults to ["home","recent"] when it is omitted, which targets visitors'
  )

  for (const value of assignments) {
    const types = [...value.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    check(
      `${builder.what} targets home only`,
      types.length === 1 && types[0] === 'home',
      `found [${types.join(', ')}] — "recent" and "travel_in" both buy people who do not live there`
    )
  }
}

// The search endpoint takes a location_types parameter too, meaning something
// completely different: which KINDS of place to return (city, region, zip). The
// regex above must not mistake one for the other, or a passing check would mean
// nothing.
const publish = read('supabase/functions/meta-publish/index.ts')
check(
  'the location SEARCH parameter is not confused with targeting',
  publish.includes("location_types: JSON.stringify(['city', 'region', 'zip'])"),
  'the search call changed shape — re-check that this script still tests targeting'
)
check(
  'and the search parameter is not what the targeting check matched',
  !/location_types\s*=\s*\[[^\]]*'city'/.test(publish)
)

// Advantage audience expansion is the other way an ad set quietly widens past
// what it was told. It is off deliberately; a regression here would look like
// the same class of bug.
for (const builder of BUILDERS) {
  const src = read(builder.file)
  if (!src.includes('advantage_audience')) continue
  check(
    `${builder.what} leaves audience expansion off`,
    /advantage_audience:\s*0/.test(src),
    'advantage_audience must be 0, or Meta delivers beyond the locations given'
  )
}

if (failures > 0) {
  console.error(`\ntargeting checks FAILED (${failures})`)
  process.exit(1)
}
console.log('\nAll targeting checks passed')
