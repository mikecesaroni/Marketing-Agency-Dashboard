// Self-check for signup links: what a link for a plan charges, what the
// client's signup page says at each point, where a link stands on the CRM's
// list, and that the pieces around it are wired. docs/client-signup.md.
// Run: node scripts/check-client-signup.mjs
//
// The rule: NOBODY IS A CLIENT UNTIL MONEY ARRIVES, THE PAGE NEVER OFFERS A
// LINK THAT CHARGES A DIFFERENT AMOUNT THAN THE SIGNUP OWES, AND THE FORM
// OPENS ONLY ONCE THE PAYMENTS ARE IN.

import { readFileSync } from 'node:fs'
import { joinPath, setupLinkAmount, signupIsOpen, signupMessage, signupOffer, signupPlan, signupRow, signupStatus, signupSummary, signupsToFinish } from '../src/lib/clientSignup.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const LINKS = {
  stripe_setup_link: 'https://buy.stripe.com/setup',
  stripe_setup_link_amount: '2500',
  stripe_monthly_link: 'https://buy.stripe.com/m998',
  stripe_monthly_1500_link: 'https://buy.stripe.com/m1500',
  stripe_monthly_2500_link: 'https://buy.stripe.com/m2500',
  stripe_monthly_3500_link: '',
}
const ID = '99999999-9999-4999-8999-999999999999'

// --- what a link charges -----------------------------------------------------
check('the address', joinPath('abc'), '/join/abc')
check('the setup fee is what the saved setup link charges', [setupLinkAmount(LINKS), setupLinkAmount({ ...LINKS, stripe_setup_link: '' }), setupLinkAmount({ ...LINKS, stripe_setup_link_amount: '' }), setupLinkAmount({})], [2500, 0, 0, 0])
check('the plan is the monthly price, with the setup fee', signupOffer({ tier: 1, links: LINKS }), { tier: 1, monthly: 1500, setup: 2500, problems: [] })
check('the Meta and Google plan', [signupOffer({ tier: 2, links: LINKS }).monthly, signupOffer({ tier: 2, links: LINKS }).problems.length], [2500, 0])
check('the setup fee waived', signupOffer({ tier: 1, withSetup: false, links: LINKS }), { tier: 1, monthly: 1500, setup: 0, problems: [] })
check('a plan with no subscription link saved cannot get a link, and says where to add it', [signupOffer({ tier: 3, links: LINKS }).problems.length, /\$3,500 a month/.test(signupOffer({ tier: 3, links: LINKS }).problems[0]), /Payments, under Stripe/.test(signupOffer({ tier: 3, links: LINKS }).problems[0])], [1, true, true])
check('no setup link saved: only "No setup fee" can be made', [signupOffer({ tier: 1, links: { ...LINKS, stripe_setup_link: '' } }).problems.length, signupOffer({ tier: 1, withSetup: false, links: { ...LINKS, stripe_setup_link: '' } }).problems.length], [1, 0])
check('no plan picked is a problem, not a guess', signupOffer({ links: LINKS }).problems, ['Pick the plan they are signing up for.'])

check('the row that is saved', signupRow({ businessName: '  Northside Heating ', email: ' Owner@Example.com ', tier: 2, links: LINKS, by: 'Ethan' }), { row: { business_name: 'Northside Heating', contact_email: 'owner@example.com', tier: 2, monthly_fee: 2500, setup_fee: 2500, created_by: 'Ethan' } })
check('the email is optional', signupRow({ businessName: 'A', tier: 1, withSetup: false, links: LINKS }).row, { business_name: 'A', contact_email: null, tier: 1, monthly_fee: 1500, setup_fee: 0, created_by: null })
check('no name, a bad email and a plan with no link are refused with the reason', [Boolean(signupRow({ businessName: ' ', tier: 1, links: LINKS }).error), Boolean(signupRow({ businessName: 'A', email: 'nope', tier: 1, links: LINKS }).error), Boolean(signupRow({ businessName: 'A', tier: 3, links: LINKS }).error), signupRow({ businessName: 'A', tier: 3, links: LINKS }).row], [true, true, true, undefined])

// --- the client's page -------------------------------------------------------
const state = (over = {}) => ({ setup_paid: false, setup_paid_on: null, monthly_started: false, monthly_started_on: null, form_submitted_at: null, ...over })
const data = (signup = {}, st = {}, extra = {}) => ({ signup: { id: ID, business_name: 'Northside Heating', contact_email: 'owner@example.com', tier: 1, monthly_fee: 1500, setup_fee: 2500, ...signup }, state: state(st), onboarding_token: null, links: LINKS, ...extra })
const brief = (p) => [p.stage, p.setup.status, p.monthly.status, p.form.status]

{
  const p = signupPlan(data())
  check('nothing paid: both payments offered, the form locked', brief(p), ['pay', 'due', 'not-started', 'locked'])
  check('the buttons carry the SIGNUP id for the webhook, and the email', [p.setup.link, p.monthly.link], [`https://buy.stripe.com/setup?client_reference_id=${ID}&prefilled_email=owner%40example.com`, `https://buy.stripe.com/m1500?client_reference_id=${ID}&prefilled_email=owner%40example.com`])
  check('the plan is said in the client\'s words', [p.name, p.monthly.package.name, p.monthly.package.includes.length > 0, p.monthly.amount, p.setup.amount], ['Northside Heating', 'CRM / Marketing Maintenance', true, 1500, 2500])
}
{
  const p = signupPlan(data({}, { setup_paid: true, setup_paid_on: '2026-11-27' }))
  check('the setup fee in: its button goes, the monthly one stays, the form stays locked', [brief(p), p.setup.link, Boolean(p.monthly.link), p.form.path], [['pay', 'paid', 'not-started', 'locked'], '', true, ''])
}
{
  const p = signupPlan(data({}, { monthly_started: true }))
  check('the subscription first: the setup fee is still owed, the form still locked', brief(p), ['pay', 'due', 'active', 'locked'])
}
{
  const p = signupPlan(data({}, { setup_paid: true, monthly_started: true }, { onboarding_token: 'tok123' }))
  check('both in: the form opens, at their onboarding link', [brief(p), p.form.path, p.setup.link, p.monthly.link, p.paid], [['form', 'paid', 'active', 'open'], '/onboarding/tok123', '', '', true])
}
check('both in but no form link came back: the form stays locked rather than linking nowhere', brief(signupPlan(data({}, { setup_paid: true, monthly_started: true }))), ['form', 'paid', 'active', 'locked'])
check('the form in: done', brief(signupPlan(data({}, { setup_paid: true, monthly_started: true, form_submitted_at: '2026-11-27T15:00:00Z' }, { onboarding_token: 'tok123' }))), ['done', 'paid', 'active', 'done'])
{
  const p = signupPlan(data({ setup_fee: 0, tier: 2, monthly_fee: 2500, contact_email: null }))
  check('no setup fee: one payment, and no setup step at all', [brief(p), p.setup.link, p.monthly.link], [['pay', 'none', 'not-started', 'locked'], '', `https://buy.stripe.com/m2500?client_reference_id=${ID}`])
  check('and the subscription alone opens the form', brief(signupPlan(data({ setup_fee: 0 }, { monthly_started: true }, { onboarding_token: 't' }))), ['form', 'none', 'active', 'open'])
}
check('a setup fee the saved link does not charge is never offered a wrong link', [signupPlan(data({ setup_fee: 1000 })).setup.link, signupPlan(data({ setup_fee: 1000 })).setup.status], ['', 'due'])
check('a monthly price with no saved link is never offered another price\'s link', signupPlan(data({ tier: 3, monthly_fee: 3500 })).monthly.link, '')
check('only an https link ever goes to a client', signupPlan({ ...data(), links: { ...LINKS, stripe_setup_link: 'javascript:alert(1)', stripe_monthly_1500_link: 'http://buy.stripe.com/x' } }).setup.link + signupPlan({ ...data(), links: { ...LINKS, stripe_monthly_1500_link: 'http://buy.stripe.com/x' } }).monthly.link, '')
check('an empty answer does not throw', brief(signupPlan(null)), ['pay', 'none', 'not-started', 'locked'])

// --- the CRM's list ----------------------------------------------------------
const row = (over = {}, st = {}) => ({ id: 's1', business_name: 'Northside Heating', tier: 1, monthly_fee: 1500, setup_fee: 2500, opened_at: null, client_id: null, finished_at: null, revoked: false, state: state(st), ...over })
check('where a link stands, in order', [
  signupStatus(row()).key,
  signupStatus(row({ opened_at: '2026-11-27T10:00:00Z' })).key,
  signupStatus(row({ client_id: 'c1' }, { setup_paid: true })).label,
  signupStatus(row({ client_id: 'c1' }, { monthly_started: true })).label,
  signupStatus(row({ client_id: 'c1' }, { setup_paid: true, monthly_started: true })).key,
  signupStatus(row({ client_id: 'c1' }, { setup_paid: true, monthly_started: true, form_submitted_at: 'x' })).key,
  signupStatus(row({ revoked: true })).key,
], ['sent', 'opened', 'Setup fee paid, monthly not started', 'Monthly started, setup fee not paid', 'form', 'done', 'cancelled'])
check('no setup fee: the subscription alone is paid in full', signupStatus(row({ setup_fee: 0, client_id: 'c1' }, { monthly_started: true })).key, 'form')
check('a cancelled link that was paid anyway is still shown as paid: the money is real', signupStatus(row({ revoked: true, client_id: 'c1' }, { setup_paid: true, monthly_started: true })).key, 'form')
check('open links are the ones still worth chasing', [row(), row({ revoked: true }), row({ client_id: 'c1' }, { setup_paid: true, monthly_started: true, form_submitted_at: 'x' }), row({ client_id: 'c1' }, { setup_paid: true })].map(signupIsOpen), [true, false, false, true])
check('what a link charges, in a few words', [signupSummary(row()), signupSummary(row({ tier: 2, monthly_fee: 2500, setup_fee: 0 }))], ['$1,500 plan · $2,500 setup + $1,500/mo', 'Meta and Google · $2,500/mo'])
check('the message carries the link and no dashes', [signupMessage({ url: 'https://x/join/t' }).includes('https://x/join/t'), /[—–]/.test(signupMessage({ url: 'u' }))], [true, false])
check('a signup is finished once: a client made and not yet told', signupsToFinish([row(), row({ id: 's2', client_id: 'c1' }), row({ id: 's3', client_id: 'c2', finished_at: 'x' })]).map((r) => r.id), ['s2'])

// --- the wiring --------------------------------------------------------------
const sql = read('supabase/client-signups.sql')
check('the page reads through one token function the anon key can call', [sql.includes('create or replace function public.client_signup_load(p_token text)'), sql.includes('grant execute on function public.client_signup_load(text) to anon, authenticated')], [true, true])
check('only the webhook\'s service key can make a client from a signup', [sql.includes('revoke all on function public.client_signup_claim(uuid) from anon'), sql.includes('revoke all on function public.client_signup_claim(uuid) from authenticated'), sql.includes('grant execute on function public.client_signup_claim(uuid) to service_role')], [true, true, true])
check('the claim locks the signup, so two payments at once make one client', sql.includes('select * into s from client_signups where id = p_id for update'), true)
check('the form link is handed over only once both payments are in', /'onboarding_token', case when paid then/.test(sql), true)
check('the table is closed to everybody but the team', [sql.includes('alter table public.client_signups enable row level security'), /for all to authenticated/.test(sql), /to anon/.test(sql.slice(sql.indexOf('create policy'), sql.indexOf('end $$')))], [true, true, false])

const hook = read('supabase/functions/stripe-webhook/index.ts')
check('the webhook asks the claim only after no client has that id', hook.indexOf("if (rows?.[0]) return { client: rows[0], via: 'client_reference_id' }") < hook.indexOf('await claimSignup(db, clientRef)') && hook.includes("db.post('rpc/client_signup_claim', { p_id: ref }"), true)
check('and tells the channel about a client it made', [hook.includes("if (result.newClientId) await announceNewClient(result.newClientId)"), hook.includes("action: 'client_added'")], [true, true])

const page = read('src/pages/ClientJoinPage.jsx')
check('the page keeps asking while there is something to wait for, and stops when done', [page.includes('setInterval(tick, CHECK_EVERY_MS)'), page.includes("if (!stage || stage === 'done') return undefined"), page.includes("document.visibilityState === 'visible'")], [true, true, true])
check('Stripe opens in a new tab; the form opens in this one', [/<GoButton href=\{setup\.link\} newTab/.test(page), /<GoButton href=\{monthly\.link\} newTab/.test(page), /<GoButton href=\{form\.path\} data-form-button>/.test(page)], [true, true, true])
check('no em dash in what a client reads', /[—–]/.test(page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), false)

const app = read('src/App.jsx')
check('the route is public, on the CRM and on the client-facing site', (app.match(/<Route path="\/join\/:token" element=\{<ClientJoinPage \/>\} \/>/g) || []).length, 2)
check('Netlify serves it from the client shell', /from = "\/join\/\*"\s*\n\s*to = "\/client\.html"/.test(read('netlify.toml')), true)
check('the Clients page has the button, and the CRM finishes a signup when a page opens', [read('src/pages/ClientsPage.jsx').includes('<SignupLinkPanel onClientMade={loadClients} />'), read('src/components/Layout.jsx').includes('m.finishSignups()')], [true, true])
const store = read('src/lib/clientSignupStore.js')
check('finishing is claimed first with a write only one browser can win', store.includes(".update({ finished_at: new Date().toISOString() }).eq('id', s.id).is('finished_at', null).select('id')") && store.indexOf("is('finished_at', null).select('id')") < store.indexOf('createOnboardingTasks({ id: s.client_id'), true)

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll client signup checks passed')
