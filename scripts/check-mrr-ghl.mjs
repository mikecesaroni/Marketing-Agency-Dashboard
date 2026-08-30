// Self-check for how GHL revenue lands in MRR. Run:
//
//   node scripts/check-mrr-ghl.mjs
//
// It exists because GHL is sold two ways and only one of them adds to the
// monthly total:
//
//   separate  $998 retainer + $399 GHL on its own subscription. Two invoices,
//             so $1,397 of MRR.
//   bundled   one $1,500 subscription that already includes GHL. Adding the
//             $399 share on top would invent revenue nobody is billed.
//
// The guarding case is "bundled is not 1500+399" -- it failed on the first
// version of this code, which is why the check is here.

import { calcMRR } from '../src/lib/billing.js'

let bad = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}

const sep = (id) => ({ id, monthly_fee: 998, ghl_plan: true, ghl_billing: 'separate', ghl_monthly_fee: 399 })
const bun = (id) => ({ id, monthly_fee: 1500, ghl_plan: true, ghl_billing: 'bundled', ghl_monthly_fee: 399 })
const plain = (id) => ({ id, monthly_fee: 998, ghl_plan: false, ghl_billing: 'bundled', ghl_monthly_fee: 399 })
const m = (id) => ({ client_id: id, payment_type: 'monthly' })
const g = (id) => ({ client_id: id, payment_type: 'ghl' })

// One separate client (998+399), one bundled (1500 incl 399), one plain (998).
check('mixed book',
  calcMRR([sep('a'), bun('b'), plain('c')], [m('a'), g('a'), m('b'), m('c')]),
  { mrr: 998 + 399 + 1500 + 998, count: 3, ghl: 798, ghlCount: 2 })

// The double-count trap: a bundled client must never have GHL added on top.
check('bundled is not 1500+399',
  calcMRR([bun('b')], [m('b')]).mrr, 1500)

// A separate client whose GHL schedule has not been built yet bills only the
// retainer -- nothing is invoicing that $399 yet.
check('separate without a ghl schedule bills the retainer only',
  calcMRR([sep('a')], [m('a')]), { mrr: 998, count: 1, ghl: 0, ghlCount: 0 })

// Archived and internal stay out of both figures.
check('archived excluded',
  calcMRR([{ ...bun('b'), archived: true }], [m('b')]), { mrr: 0, count: 0, ghl: 0, ghlCount: 0 })
check('internal excluded',
  calcMRR([{ ...bun('b'), is_internal: true }], [m('b')]), { mrr: 0, count: 0, ghl: 0, ghlCount: 0 })

// Turning the plan off zeroes the GHL slice even with the fee still stored.
check('plan off means no ghl revenue',
  calcMRR([plain('c')], [m('c')]), { mrr: 998, count: 1, ghl: 0, ghlCount: 0 })

console.log(bad ? `\n${bad} FAILED` : '\nAll checks passed')
process.exit(bad ? 1 : 0)
