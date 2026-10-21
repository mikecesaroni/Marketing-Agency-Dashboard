// Self-check for publishing into ad sets that already exist: the ad sets
// decide whether the creative carries an instant form or a link, and the
// form or link the ad set's own ads use is read off the check verdicts.
// Run: node scripts/check-publish-destination.mjs
//
// The rule: WHEN THE AD SETS ARE PICKED, THE OBJECTIVE BUTTONS DO NOT COUNT.
// "All live ad sets" on an account whose ads go to a website must not ask
// for an instant form, and an instant-form ad set gets the form its other
// ads use without a click.

import { readFileSync } from 'node:fs'
import { creativeNeeds, describeAdsetDestination, formFromChecks, linkFromChecks } from '../src/lib/publishDestination.js'
import { usesFromAds } from '../supabase/functions/_shared/adsetUses.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const FORM = { value: 'LEADS_FORM', needsForm: true, needsLink: true, needsPixel: false }
const WEB = { value: 'LEADS_WEBSITE', needsForm: false, needsLink: true, needsPixel: true }
const traffic = { id: 'a1', name: 'Cold · Manchester', objective: 'TRAFFIC' }
const web = { id: 'a2', name: 'Retargeting', objective: 'LEADS_WEBSITE' }
const form = { id: 'a3', name: 'Nashua forms', objective: 'LEADS_FORM' }
const brief = (n) => ({ from: n.from, needsForm: n.needsForm, needsLink: n.needsLink, needsPixel: n.needsPixel })

// --- what the creative has to carry ---------------------------------------------
check('a new ad set: the objective buttons decide', brief(creativeNeeds({ reuseAdset: false, adsets: [], objective: FORM })), { from: 'objective', needsForm: true, needsLink: true, needsPixel: false })
check('a new website-leads ad set wants the pixel', brief(creativeNeeds({ objective: WEB })), { from: 'objective', needsForm: false, needsLink: true, needsPixel: true })
check('reuse ticked but nothing picked yet: still the buttons', brief(creativeNeeds({ reuseAdset: true, adsets: [], objective: FORM })), { from: 'objective', needsForm: true, needsLink: true, needsPixel: false })
check('website ad sets picked: no form, even with the form button lit', brief(creativeNeeds({ reuseAdset: true, adsets: [traffic, web], objective: FORM })), { from: 'adsets', needsForm: false, needsLink: true, needsPixel: false })
check('a form ad set picked: a form, even with Website lit', brief(creativeNeeds({ reuseAdset: true, adsets: [form], objective: WEB })), { from: 'adsets', needsForm: true, needsLink: true, needsPixel: false })
check('a mixed pick needs the form and the link', brief(creativeNeeds({ reuseAdset: true, adsets: [traffic, form], objective: WEB })), { from: 'adsets', needsForm: true, needsLink: true, needsPixel: false })
check('the pick is sorted into form and website ad sets', creativeNeeds({ reuseAdset: true, adsets: [traffic, form, web] }).formAdsets.map((a) => a.name).concat('|', creativeNeeds({ reuseAdset: true, adsets: [traffic, form, web] }).webAdsets.map((a) => a.name)), ['Nashua forms', '|', 'Cold · Manchester', 'Retargeting'])
check('an ad set with no objective read back counts as a website one', brief(creativeNeeds({ reuseAdset: true, adsets: [{ id: 'x', name: 'Old' }] })), { from: 'adsets', needsForm: false, needsLink: true, needsPixel: false })

// --- the sentence under Objective -----------------------------------------------
check('one website ad set', describeAdsetDestination([traffic]), 'Cold · Manchester sends people to the website, so there is no instant form to pick.')
check('all website', describeAdsetDestination([traffic, web]), 'All 2 send people to the website, so there is no instant form to pick.')
check('one form ad set', describeAdsetDestination([form]), 'Nashua forms opens an instant form, so the ad gets the form its other ads use.')
check('mixed names both sides', describeAdsetDestination([traffic, form, web]), 'Nashua forms opens an instant form; Cold · Manchester, Retargeting send people to the website. Each ad is built for its own ad set, so both the form and the link are used.')
check('nothing picked says nothing', describeAdsetDestination([]), '')

// --- what the ad set's own ads carry (the function's reader) ----------------------
const linkAd = { id: '1', name: 'WC_Fall tune-up', effective_status: 'ACTIVE', creative: { object_story_spec: { page_id: '9', link_data: { link: 'https://site.example/fall', message: 'x', call_to_action: { type: 'LEARN_MORE', value: { link: 'https://site.example/fall' } } } } } }
const formAd = { id: '2', name: 'WC_Free quote', effective_status: 'ACTIVE', creative: { object_story_spec: { page_id: '9', link_data: { link: 'https://site.example/', call_to_action: { type: 'LEARN_MORE', value: { lead_gen_form_id: '555' } } } } } }
const videoFormAd = { id: '3', name: 'WC_Clip', effective_status: 'PAUSED', creative: { object_story_spec: { page_id: '9', video_data: { video_id: 'v', call_to_action: { type: 'LEARN_MORE', value: { lead_gen_form_id: '777' } } } } } }
const feedAd = { id: '4', name: 'WC_Three sizes', effective_status: 'PAUSED', creative: { object_story_spec: { page_id: '9' }, asset_feed_spec: { link_urls: [{ website_url: 'https://site.example/feed' }], call_to_actions: [{ type: 'LEARN_MORE', value: { lead_gen_form_id: '888' } }] } } }
check('a link ad: the link, no form', usesFromAds([linkAd]), { lead_form_id: '', link_url: 'https://site.example/fall', ad_id: '1', ad_name: 'WC_Fall tune-up', ads: 1, active: 1 })
check('a form ad: the form id off the button, and the link it still carries', usesFromAds([formAd]), { lead_form_id: '555', link_url: 'https://site.example/', ad_id: '2', ad_name: 'WC_Free quote', ads: 1, active: 1 })
check('a video form ad reads video_data', usesFromAds([videoFormAd]).lead_form_id, '777')
check('a per-placement ad reads asset_feed_spec', [usesFromAds([feedAd]).lead_form_id, usesFromAds([feedAd]).link_url], ['888', 'https://site.example/feed'])
check('a delivering ad wins over a paused one listed first', usesFromAds([videoFormAd, formAd]).ad_id, '2')
check('all paused: the first listed (newest)', usesFromAds([videoFormAd, feedAd]).ad_id, '3')
check('no ads, or ads with no creative, is nothing to read', [usesFromAds([]), usesFromAds([{ id: '9' }]), usesFromAds(undefined)], [null, null, null])

// --- reading the verdicts back on the screen -------------------------------------
const checks = {
  a1: { ok: true, adset_name: 'Cold · Manchester', uses: { lead_form_id: '', link_url: 'https://site.example/fall', ad_name: 'WC_Fall tune-up' } },
  a3: { ok: true, adset_name: 'Nashua forms', uses: { lead_form_id: '555', lead_form_name: 'Nashua enquiries', link_url: 'https://site.example/', ad_name: 'WC_Free quote' } },
}
check('the form comes from the first picked ad set that has one', formFromChecks(checks, ['a1', 'a3'], [traffic, form]), { id: '555', name: 'Nashua enquiries', adsetName: 'Nashua forms', adName: 'WC_Free quote' })
check('no form among the picked ad sets', formFromChecks(checks, ['a1'], [traffic]), null)
check('a verdict still pending is skipped, not crashed on', formFromChecks({ a3: undefined }, ['a3'], [form]), null)
check('the link comes from the first picked ad set that has one', linkFromChecks(checks, ['a3', 'a1'], [traffic, form]), { url: 'https://site.example/', adsetName: 'Nashua forms', adName: 'WC_Free quote' })
check('the ad set name falls back to the verdict when the list has not got it', formFromChecks(checks, ['a3'], []).adsetName, 'Nashua forms')

// --- the screen reads these, not the objective buttons ----------------------------
const panel = readFileSync(new URL('../src/components/PublishToMetaPanel.jsx', import.meta.url), 'utf8')
check('the panel derives its needs from the picked ad sets', /creativeNeeds\(\{ reuseAdset, adsets: chosenAdsets, objective: chosenObjective \}\)/.test(panel), true)
check('the form section and its blocker follow the ad sets', /needs\.needsForm && !leadForm\) blockers\.push/.test(panel) && /\{needs\.needsForm && \(\s*<Section/.test(panel), true)
check('no section or blocker reads the objective buttons directly any more', (panel.match(/chosenObjective\?\.needs/g) || []).length, 0)
check('the form the other ads use is picked on its own', /formFromChecks\(adsetChecks, adsetIds/.test(panel) && /setLeadForm\(\(cur\) => cur \|\|/.test(panel), true)
check('the link the other ads use goes in the box over a CRM-filled one', /adsetLink\?\.url \|\| defaultMetaLink/.test(panel), true)
const fn = readFileSync(new URL('../supabase/functions/meta-adset-check/index.ts', import.meta.url), 'utf8')
check('the check function reads the ad set\'s ads and names the form', /creative\{object_story_spec,asset_feed_spec\}/.test(fn) && /usesFromAds\(/.test(fn) && /lead_form_name/.test(fn) && /uses,\s*\}/.test(fn), true)
check('reading the ads never turns into a refusal', /try \{\s*const found = await graphGet\(\s*`\$\{adsetId\}\/ads`/.test(fn) && /\} catch \{\s*uses = null/.test(fn), true)

console.log(failures === 0 ? '\nAll publish destination checks pass' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
