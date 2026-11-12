// Self-check: the budget sits on the campaign (2026-11-12). Run: node scripts/check-campaign-budget.mjs
//
// "When we are publishing new campaigns and ad sets for new clients, can we
// make it so the spend is at the campaign level instead of the ad set
// level." Source markers, since meta-publish runs in Deno and the panel in
// the browser: the campaign is created holding the budget and the bid
// strategy, the ad set brings them only under a campaign that does not,
// and the form no longer refuses a campaign that holds its own.

import { readFileSync } from 'node:fs'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const fn = read('supabase/functions/meta-publish/index.ts')
const create = fn.slice(fn.indexOf("'create campaign'") - 1200, fn.indexOf("'create campaign'"))
check('a new campaign is created holding the daily budget and the bid strategy, not ad set budget sharing', [create.includes('daily_budget: budget,'), create.includes("bid_strategy: 'LOWEST_COST_WITHOUT_CAP'"), create.includes('is_adset_budget_sharing_enabled:')], [true, true, false])
check('...and is then known to hold it', fn.includes('campaignHoldsBudget = true'), true)
check('the ad set brings a budget and a bid strategy only under a campaign that holds none', fn.includes("...(campaignHoldsBudget ? {} : { daily_budget: budget, bid_strategy: 'LOWEST_COST_WITHOUT_CAP' })"), true)
check('an existing campaign is read for its budget before the ad set is built, and checked to be the client\'s', [fn.includes("fields: 'id,account_id,daily_budget,lifetime_budget'"), fn.includes("That campaign does not belong to ${client.name}'s ad account")], [true, true])
check('no budget is demanded under a campaign that holds its own', fn.includes('if (!campaignHoldsBudget && Math.round(Number(dailyBudgetCents) || 0) < MIN_DAILY_BUDGET_CENTS)'), true)
check('the record keeps whichever figure applies', fn.includes('campaignHoldsBudget ? campaignBudgetCents : budget'), true)

const panel = read('src/components/PublishToMetaPanel.jsx')
check('the form no longer refuses a campaign that holds its own budget, and asks for none under it', [panel.includes('that campaign sets its own budget'), panel.includes('const campaignHoldsBudget = Boolean(reuseCampaign && chosenCampaign?.campaign_budget)'), panel.includes("if (!campaignHoldsBudget && budgetCents < 100) blockers.push('budget under $1.00')"), panel.includes('data-budget-held')], [false, true, true, true])
check('the review line says where the money sits', read('src/lib/metaPublish.js').includes('/day on the campaign'), true)

if (failures) {
  console.log(`\n${failures} FAILED`)
  process.exit(1)
}
console.log('\nAll campaign budget checks passed.')
