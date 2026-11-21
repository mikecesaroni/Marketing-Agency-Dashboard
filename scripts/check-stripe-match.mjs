// Self-check for "the CRM follows Stripe". Run: node scripts/check-stripe-match.mjs
//
// The rule: A CLIENT'S FEE AND PACKAGE ARE WHAT STRIPE CHARGES, AND RECORDING
// A PAYMENT NEVER FAILS BECAUSE THE MATCHING DID. The matching itself runs in
// Postgres (supabase/stripe-match.sql), where Node cannot run it, so this
// checks the two things that can silently drift: the package prices written
// into the SQL against the ones the app uses, and the guard that keeps a
// broken match from blocking a payment.

import { readFileSync } from 'node:fs'
import { TIERS, tierFromFee } from '../src/lib/clientTiers.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const sql = readFileSync(new URL('../supabase/stripe-match.sql', import.meta.url), 'utf8')
const code = sql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')

// The SQL's price ladder, as [price, tolerance, tier].
const ladder = [...code.matchAll(/when abs\(latest\.total - (\d+)\) <= (\d+) then (\d)/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])])
check('the SQL knows every package price, and which package it is', ladder.map(([p, , t]) => [p, t]), TIERS.map((t) => [t.price, t.tier]))
// The same $100 the app allows either side of a price.
check('the SQL allows the same $100 either side', [...new Set(ladder.map(([, tol]) => tol))], [100])
check('and that is the app\'s edge too', [tierFromFee(1600), tierFromFee(1601), tierFromFee(1400), tierFromFee(1399)], [1, 0, 1, 0])

check('a failed match is swallowed, so the payment is still recorded', /perform public\.match_client_to_stripe\(new\.client_id\);\s*exception when others then\s*null;/.test(code), true)
check('only a paid monthly payment that came from Stripe starts a match', /new\.status = 'paid' and new\.payment_type = 'monthly'[\s\S]*new\.stripe_invoice_id is not null or new\.stripe_event_id is not null/.test(code), true)
check('it runs on new payments and on scheduled ones being marked paid', /create or replace trigger payments_match_stripe\s+after insert or update of [a-z_, ]*status/.test(code), true)
check('an archived client is left alone', /coalesce\(c\.archived, false\) then\s*return null/.test(code), true)
check('equal charges on one day are not added together', /latest\.amounts <> latest\.n then 'two equal charges on one day'/.test(code), true)
check('a new amount that is no package price waits to be charged twice', /not is_package and coalesce\(prev_n, 0\) > 0 and prev_total is distinct from latest\.total/.test(code), true)
check('only months still to come are repriced, never a paid one', /status in \('pending', 'overdue'\)\s+and due_date > latest\.day/.test(code), true)
// Running a file with "drop" in it through the migration tool stops and asks.
check('the file can be run again without removing anything', /\bdrop\b/i.test(code), false)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll Stripe match checks pass')
process.exit(failures ? 1 : 0)
