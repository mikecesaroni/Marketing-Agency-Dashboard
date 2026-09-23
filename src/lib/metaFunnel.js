// Talking to the meta-funnel function.
//
// Three calls, all thin. The judgement lives in funnelPlan.js, which is pure
// and checked; this only carries it across the wire and turns a failure into
// a sentence somebody can act on.

import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'

async function call(body) {
  const { data, error } = await supabase.functions.invoke('meta-funnel', { body })

  if (error) {
    const { status, detail } = await readFunctionError(error)
    // No status at all means nothing reached the browser: the function is
    // undeployed or not answering the preflight. supabase-js reports both as
    // "Failed to send a request", which names neither.
    if (!status) {
      throw new Error(
        'Could not reach the funnel function. It is probably not deployed yet — deploy meta-funnel in Supabase and try again.'
      )
    }
    if (status === 404) {
      throw new Error('The funnel function is not deployed yet. Deploy meta-funnel in Supabase, then try again.')
    }
    throw new Error(detail || `The funnel function returned ${status}.`)
  }

  if (data?.error) throw new Error(data.error)
  return data
}

/** Saved audiences on the client's ad account, newest work first. */
export async function listAudiences(clientId) {
  const data = await call({ action: 'list_audiences', client_id: clientId })
  return data?.audiences || []
}

/** What is already built on the account, with the targeting that matters. */
export async function inspectAccount(clientId) {
  return await call({ action: 'inspect', client_id: clientId })
}

/**
 * Creates the four standard audiences the live accounts run on, skipping any
 * that already exist by name. Each result is one of: created, exists,
 * skipped (with the reason the client cannot have it), failed (Meta's words).
 */
export async function createStandardAudiences(clientId) {
  return await call({ action: 'create_audiences', client_id: clientId })
}

/**
 * Builds the campaigns and ad sets. Everything arrives PAUSED.
 *
 * `plan` is what funnelPlan() returned: {campaigns, adsets}. Budgets are keyed
 * by stage because they belong to the campaigns, not the ad sets.
 */
export async function createFunnel({
  clientId,
  plan,
  locations,
  ageMin,
  ageMax,
  budgetCents,
  optimizationGoal,
  specialAdCategories = [],
  nameSuffix,
}) {
  return await call({
    action: 'create_funnel',
    client_id: clientId,
    adsets: plan.adsets.map((a) => ({
      key: a.key,
      stage: a.stage,
      name: a.name,
      include: a.include,
      exclude: a.exclude,
      advantage_audience: a.advantage_audience,
    })),
    budget_cents: budgetCents,
    locations,
    age_min: ageMin,
    age_max: ageMax,
    optimization_goal: optimizationGoal,
    special_ad_categories: specialAdCategories,
    name_suffix: nameSuffix,
  })
}
