// Self-check for the live onboarding call sheet. Run: node scripts/check-onboarding-call.mjs
//
// The rule: WHAT THE CRM ALREADY KNOWS TICKS ITSELF, WHAT IT CANNOT KNOW IS
// TICKED BY HAND, AND A STEP THAT DOES NOT APPLY TO THIS CLIENT IS NOT ON THE
// SHEET. The recap email is built from the same sheet, so a step that is open
// on screen is a step the owner reads about in the recap.

import {
  CALL_SECTIONS,
  callOpening,
  callProgress,
  openItems,
  preCallEmail,
  recapEmail,
  stepState,
  visibleSections,
} from '../src/lib/onboardingCall.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}
const find = (key) => CALL_SECTIONS.flatMap((s) => s.steps).find((s) => s.key === key)

// --- the sheet is well formed ----------------------------------------------------

const allKeys = CALL_SECTIONS.flatMap((s) => s.steps.map((st) => st.key))
check('every step key is unique', new Set(allKeys).size, allKeys.length)
check('every step has a how', CALL_SECTIONS.flatMap((s) => s.steps).every((st) => st.how.length > 40), true)
check('the sheet runs before, open, ghl, meta, google, site, leads, wrap', CALL_SECTIONS.map((s) => s.key), [
  'before', 'open', 'ghl', 'meta', 'google', 'site', 'leads', 'wrap',
])

// --- what applies to whom ------------------------------------------------------------

const noGhl = { client: { name: 'Belk Heating', ghl_plan: false }, intake: {}, link: {}, ghl: {} }
const withGhl = { client: { name: 'Belk Heating', ghl_plan: true }, intake: {}, link: {}, ghl: {} }
check('no GHL plan: the GHL section is gone', visibleSections(noGhl).some((s) => s.key === 'ghl'), false)
check('no GHL plan: routing other lead sources into GHL is gone too', visibleSections(noGhl).some((s) => s.steps.some((st) => st.key === 'third_party')), false)
check('GHL plan: the GHL section is there', visibleSections(withGhl).some((s) => s.key === 'ghl'), true)

// --- auto ticks --------------------------------------------------------------------

const fresh = { client: { name: 'X' }, intake: {}, link: {}, ghl: {} }
check('fresh client: budget is open', stepState(find('budget'), fresh, new Set()), 'open')
check('a Meta budget ticks budget', stepState(find('budget'), { ...fresh, client: { meta_budget_per_day: 40 } }, new Set()), 'auto')
check('an LSA-only budget ticks budget', stepState(find('budget'), { ...fresh, client: { lsa_budget_per_day: 25 } }, new Set()), 'auto')
check('a linked Drive folder ticks photos', stepState(find('photos'), { ...fresh, client: { drive_folder_id: 'abc' } }, new Set()), 'auto')
check('page + ad account ticks partner access', stepState(find('bm_partner'), { ...fresh, client: { meta_page_id: '1', meta_ad_account_id: '2' } }, new Set()), 'auto')
check('ad account alone does not', stepState(find('bm_partner'), { ...fresh, client: { meta_ad_account_id: '2' } }, new Set()), 'open')
check('GHL form submitted via the link ticks ghl_form', stepState(find('ghl_form'), { ...fresh, link: { ghl_submitted_at: '2026-09-01' } }, new Set()), 'auto')
check('GHL form completed in the CRM ticks ghl_form', stepState(find('ghl_form'), { ...fresh, ghl: { completed_at: '2026-09-01' } }, new Set()), 'auto')
check('target cities tick targeting', stepState(find('targeting'), { ...fresh, intake: { target_cities: 'Raleigh, Cary' } }, new Set()), 'auto')
check('a privacy URL ticks privacy_url', stepState(find('privacy_url'), { ...fresh, client: { privacy_policy_url: 'https://x.com/p' } }, new Set()), 'auto')
check('"yes" on website access ticks site_access', stepState(find('site_access'), { ...fresh, intake: { has_website_access: 'Yes' } }, new Set()), 'auto')
check('"no" on website access leaves it open', stepState(find('site_access'), { ...fresh, intake: { has_website_access: 'No' } }, new Set()), 'open')

// --- hand ticks and the lag case ------------------------------------------------------

check('a hand tick shows as done', stepState(find('thread'), fresh, new Set(['thread'])), 'done')
check('an array of keys works too', stepState(find('thread'), fresh, ['thread']), 'done')
check('an auto step the CRM cannot yet see can be ticked by hand', stepState(find('photos'), fresh, new Set(['photos'])), 'done')
check('the CRM view wins over a hand tick when both are true', stepState(find('photos'), { ...fresh, client: { drive_folder_id: 'abc' } }, new Set(['photos'])), 'auto')

// --- progress ----------------------------------------------------------------------

const p0 = callProgress(noGhl, new Set())
check('fresh client without GHL has nothing done', p0.done, 0)
check('and a total that excludes the GHL steps', p0.total, CALL_SECTIONS.flatMap((s) => s.steps).length - 6)
const p1 = callProgress(noGhl, new Set(['thread', 'zoom']))
check('two ticks are two done', p1.done, 2)
check('percent is rounded', p1.pct, Math.round((200 / p0.total)))

// --- copy --------------------------------------------------------------------------

const ctx = {
  client: { name: 'Belk Heating and Cooling', ghl_plan: true },
  intake: { owner_name: 'Travis Belk' },
  link: {},
  ghl: {},
  onboardingUrl: 'https://crm.example/onboarding/tok',
  driveUrl: 'https://drive.google.com/drive/folders/abc',
  closerName: 'Ethan',
}
const pre = preCallEmail(ctx)
check('pre-call email greets by first name', pre.startsWith('Hi Travis,'), true)
check('pre-call email carries the form link', pre.includes('https://crm.example/onboarding/tok'), true)
check('folder already linked: keep adding to it', pre.includes('Keep adding to the folder you shared') && pre.includes('https://drive.google.com/drive/folders/abc'), true)
check('pre-call email asks for the Zoom app', /Zoom app/.test(pre), true)
check('pre-call email never lists access requests', /admin|Business Manager|Search Console|DNS/i.test(pre), false)

const fresh2 = { client: { name: 'Dynamic Flow' }, intake: {}, crmDriveEmail: 'crm-drive@example.iam.gserviceaccount.com' }
const preNew = preCallEmail(fresh2)
check('no name: "Hi there," not "Hi ,"', preNew.startsWith('Hi there,'), true)
check('no folder yet: tells them to make one named for the business', preNew.includes('"Dynamic Flow Photos"'), true)
check('no folder yet: tells them to share it with the CRM Drive address', preNew.includes('share it with crm-drive@example.iam.gserviceaccount.com'), true)
check('no folder yet: tells them to paste the link into the form', /paste the folder link into the form/.test(preNew), true)
check('no link yet: says the link follows rather than leaving a blank', /\(link to follow\)/.test(preNew), true)
check('CRM address unknown: still says to share, via the form', /share it with the Drive address in the form/.test(preCallEmail({ client: { name: 'X' }, intake: {} })), true)

const opening = callOpening(ctx)
check('opening names the closer', opening.includes('Ethan'), true)
check('opening asks for screen control', /control it/.test(opening), true)

const recap = recapEmail(ctx, new Set(['thread', 'zoom', 'ghl_user']))
check('recap lists what was done', /DONE ON THE CALL[\s\S]*- Start one email thread/.test(recap), true)
check('recap lists what is still open, with its section', /STILL TO DO[\s\S]*- Meta: Two-factor authentication/.test(recap), true)
check('recap never lists the copy-only steps as open', /Send the recap in the thread/.test(recap), false)
const allDone = new Set(CALL_SECTIONS.flatMap((s) => s.steps.map((st) => st.key)))
check('a finished sheet says nothing is outstanding', /Nothing outstanding/.test(recapEmail(ctx, allDone)), true)
check('openItems groups by section', openItems(noGhl, new Set())[0].section, 'Before the call')

console.log(failures ? `\n${failures} check(s) failed` : '\nAll onboarding-call checks pass')
process.exit(failures ? 1 : 0)
