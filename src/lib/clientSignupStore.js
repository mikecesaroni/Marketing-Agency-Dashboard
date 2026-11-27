// Signup links: the reads and writes (the pure half is clientSignup.js).
//
// The client's page reads through client_signup_load, a token function the
// anon key can call and nothing else (supabase/client-signups.sql). The team
// makes, lists and cancels links on the table itself. The client row is made
// by the Stripe webhook on the first payment; what is left for the CRM is
// the two things the add form does by hand: Ken's onboarding tasks and the
// channel, done by finishSignups the next time anybody has the CRM open.

import { supabase } from './supabaseClient'
import { signupRow, signupsToFinish } from './clientSignup.js'
import { fetchStripeLinks, linksAsSettings } from './stripeLinks'
import { createOnboardingTasks, readMe } from './tasksData'
import { announceClient } from './teamBriefClient'

/** Everything the signup page shows, or null when the token is not a live link. */
export async function loadSignup(token) {
  const { data, error } = await supabase.rpc('client_signup_load', { p_token: token })
  if (error) throw error
  return data || null
}

/** Every link with where it stands, newest first. */
export async function listSignups() {
  const { data, error } = await supabase.rpc('client_signups_list')
  if (error) throw error
  return Array.isArray(data) ? data : []
}

/** The saved Stripe links, as the settings the pure half reads. */
export async function signupLinks() {
  return linksAsSettings(await fetchStripeLinks())
}

/** Makes a link. Throws with the reason when it cannot (no name, no Stripe link for the plan). */
export async function createSignup({ businessName, email, tier, withSetup, links }) {
  const { row, error: why } = signupRow({ businessName, email, tier, withSetup, links, by: readMe() })
  if (why) throw new Error(why)
  const { data, error } = await supabase.from('client_signups').insert(row).select().single()
  if (error) throw error
  return data
}

/** Cancels a link: it opens as not valid from now on. */
export async function cancelSignup(id) {
  const { error } = await supabase.from('client_signups').update({ revoked: true }).eq('id', id)
  if (error) throw error
}

const FINISH_KEY = 'signups-finished-at'
const FINISH_EVERY_MS = 5 * 60 * 1000

/**
 * Finishes any signup a payment turned into a client: Ken's onboarding
 * tasks, and the channel (the webhook tells it already; this is the
 * catch, and it posts once either way). Each signup is claimed first with
 * a write only one browser can win, so two people with the CRM open make
 * one set of tasks. Quiet on every failure: the client exists regardless,
 * and the tasks can be made from their page.
 *
 * Returns how many it finished. `force` skips the five-minute rest between
 * looks that keeps every page change from asking.
 */
export async function finishSignups({ force = false, rows = null } = {}) {
  try {
    if (!force) {
      const last = Number(sessionStorage.getItem(FINISH_KEY)) || 0
      if (Date.now() - last < FINISH_EVERY_MS) return 0
      sessionStorage.setItem(FINISH_KEY, String(Date.now()))
    }
  } catch {
    /* no storage: look every time */
  }
  try {
    let waiting = rows
    if (!waiting) {
      const { data, error } = await supabase.from('client_signups').select('id, client_id, business_name, tier, created_by, finished_at').not('client_id', 'is', null).is('finished_at', null)
      if (error) return 0
      waiting = data || []
    }
    let done = 0
    for (const s of signupsToFinish(waiting)) {
      const { data: won } = await supabase.from('client_signups').update({ finished_at: new Date().toISOString() }).eq('id', s.id).is('finished_at', null).select('id')
      if (!won?.length) continue
      await announceClient(s.client_id).catch(() => {})
      await createOnboardingTasks({ id: s.client_id, name: s.business_name, tier: s.tier }, s.created_by || readMe()).catch(() => {})
      done++
    }
    return done
  } catch {
    return 0
  }
}
