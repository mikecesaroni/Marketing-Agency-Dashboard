// Self-check for the WC_ naming rule. Run: node scripts/check-ad-naming.mjs
//
// The rule: EVERY CAMPAIGN, AD SET AND AD THE CRM CREATES STARTS WITH WC_,
// EXACTLY ONCE. The second half matters as much as the first -- a prefix
// applied twice on a re-save is how "WC_WC_WC_Spring" ends up in a report.
//
// The last block reads the two edge functions that build names server-side
// and checks they carry the same rule, because they cannot import it.

import { readFileSync } from 'node:fs'
import { WC_PREFIX, isWcName, wcName } from '../src/lib/adNaming.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

check('the prefix is WC_', WC_PREFIX, 'WC_')
check('a plain name gets the prefix', wcName('Horizon HVAC — 2026'), 'WC_Horizon HVAC — 2026')
check('an already prefixed name is left alone', wcName('WC_Horizon HVAC — 2026'), 'WC_Horizon HVAC — 2026')
check('lower-case prefix counts as prefixed', wcName('wc_spring push'), 'wc_spring push')
check('applying it twice is the same as once', wcName(wcName('Retargeting')), 'WC_Retargeting')
check('surrounding whitespace is dropped first', wcName('  Broad — lead excluded '), 'WC_Broad — lead excluded')
check('an empty name stays empty, so required-name checks still fire', wcName(''), '')
check('null is an empty name, not "WC_null"', wcName(null), '')
check('undefined is an empty name too', wcName(undefined), '')
check('isWcName agrees with wcName', isWcName(wcName('x')), true)
check('isWcName rejects a name without it', isWcName('Horizon HVAC — 2026'), false)
check('isWcName rejects a prefix in the middle', isWcName('Old WC_ campaign'), false)

// ------------------------------------------- the edge functions carry it too
//
// The two server-side builders each define the same helper inline. This does
// not run them; it checks the constant is there and spelt the same, so the
// three paths cannot quietly drift to different prefixes.
for (const fn of ['meta-funnel', 'meta-manage']) {
  const src = readFileSync(new URL(`../supabase/functions/${fn}/index.ts`, import.meta.url), 'utf8')
  check(`${fn} carries the WC_ prefix constant`, /const WC_PREFIX = 'WC_'/.test(src), true)
  check(`${fn} applies it through wcName()`, /function wcName\(/.test(src) && /wcName\(/.test(src.replace(/function wcName\(/, '')), true)
}

// The publish panel is the third path. It applies the rule from the app lib.
{
  const src = readFileSync(new URL('../src/components/PublishToMetaPanel.jsx', import.meta.url), 'utf8')
  check('the publish panel imports the rule', /from '\.\.\/lib\/adNaming'/.test(src), true)
  check('the publish panel names the campaign through it', /campaign_name: .*wcName\(/.test(src), true)
  check('the publish panel names the ad set through it', /adset_name: .*wcName\(/.test(src), true)
  check('the publish panel names every ad through it', (src.match(/ad_name: wcName\(/g) || []).length >= 2, true)
}

if (failures) {
  console.log(`\n${failures} check${failures === 1 ? '' : 's'} failed`)
  process.exit(1)
}
console.log('\nAll naming checks passed')
