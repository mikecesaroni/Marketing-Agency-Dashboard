// Self-check for the GHL setup brief. Run: node scripts/check-ghl-setup.mjs
//
// There is no test runner in this project and this does not add one. It exists
// because formatGhlSetup output is what a human pastes in to configure a real
// client's account, so a silent change here misconfigures a paying client.
// The thing it most needs to guarantee: a missing EIN is stated as missing
// rather than quietly absent from the paste.

import assert from 'node:assert/strict'
import {
  emptyGhlSetup,
  mergeGhlSetup,
  missingRequired,
  formatGhlSetup,
  GHL_SETUP_KEYS,
} from '../src/lib/ghlSetupFields.js'

const complete = {
  ...emptyGhlSetup(),
  legal_business_name: 'Plumb Quick LLC',
  business_address: '4501 Ross Ave',
  business_city: 'Dallas',
  business_state: 'TX',
  business_postal_code: '75204',
  timezone: 'America/Chicago',
  main_phone: '(214) 555-0142',
  support_email: 'robert@plumbquick.com',
  ein: '88-1234567',
  business_entity_type: 'Limited Liability Company (LLC)',
}

// 1. A complete form reports nothing missing and never prints the warning block.
assert.deepEqual(missingRequired(complete), [])
const full = formatGhlSetup(complete, 'Plumb Quick')
assert.ok(full.includes('GHL SETUP: Plumb Quick'))
assert.ok(full.includes('EIN (federal tax ID): 88-1234567'))
assert.ok(!full.includes('STILL MISSING'), 'complete form must not warn')

// 2. The one that matters. A blank EIN must be named, not silently dropped.
const noEin = { ...complete, ein: '' }
assert.deepEqual(missingRequired(noEin), ['ein'])
const partial = formatGhlSetup(noEin, 'Plumb Quick')
assert.ok(partial.includes('STILL MISSING'), 'missing EIN must be called out')
assert.ok(partial.includes('EIN (federal tax ID)'))
assert.ok(partial.includes('Do not invent values'))

// 3. Whitespace is not an answer.
assert.deepEqual(missingRequired({ ...complete, main_phone: '   ' }), ['main_phone'])

// 4. Empty optional fields are dropped rather than printed as empty labels.
assert.ok(!full.includes('Online booking link:'))

// 5. Merge keeps saved values and leaves unsaved ones as empty strings, never
//    null, or React flips the input to uncontrolled mid-edit.
const merged = mergeGhlSetup(emptyGhlSetup(), { ein: '99-9999999', booking_url: null })
assert.equal(merged.ein, '99-9999999')
assert.equal(merged.booking_url, '')
assert.equal(mergeGhlSetup(emptyGhlSetup(), null).ein, '')

// 6. Country defaults to US; every spec'd key exists in empty state.
assert.equal(emptyGhlSetup().business_country, 'US')
assert.equal(Object.keys(emptyGhlSetup()).length, GHL_SETUP_KEYS.length)

console.log('ghl-setup checks passed')
