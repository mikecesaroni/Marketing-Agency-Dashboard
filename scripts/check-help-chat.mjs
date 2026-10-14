// Self-check for the help chat: the tool registry, the page state, loose
// name matching, and the brief the model is given.
// Run: node scripts/check-help-chat.mjs

import {
  PAGE_STATE_TOOL,
  helpPageState,
  listHelpTools,
  looseMatch,
  registerHelpActions,
  resetHelpActions,
  runHelpTool,
  setHelpPage,
} from '../src/lib/helpActions.js'
import { HELP_SUGGESTIONS, buildHelpBrief, pageContextText, toolLabel } from '../src/lib/helpBrief.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// The registry.
resetHelpActions()
setHelpPage({ path: '/publish/c1', title: 'Publish' })
check('page_state is always offered', listHelpTools().map((t) => t.name), ['page_state'])
const unregister = registerHelpActions('publish', {
  label: 'Publish page',
  state: () => ({ ticked: 2, blockers: ['no locations'] }),
  tools: [
    { name: 'publish_tick', description: 'Tick a creative', input_schema: { type: 'object', properties: { which: { type: 'string' } } }, run: ({ which }) => ({ ticked: which }) },
    { name: 'publish_go', description: 'Publish', confirm: true, run: () => { throw new Error('boom') } },
  ],
})
const globals = [{ name: 'go_to', description: 'Open a page', input_schema: { type: 'object', properties: {} }, run: () => ({ ok: true }) }]
check('tools: page_state, the globals, then the page', listHelpTools(globals).map((t) => t.name), ['page_state', 'go_to', 'publish_tick', 'publish_go'])
check('only name, description and schema go to the API', Object.keys(listHelpTools(globals)[3]), ['name', 'description', 'input_schema'])
check('a tool without a schema gets an empty object one', listHelpTools(globals)[3].input_schema, { type: 'object', properties: {} })
check('page state carries the path and every scope', helpPageState(), { path: '/publish/c1', title: 'Publish', on_screen: { publish: { ticked: 2, blockers: ['no locations'] } } })
check('running a tool returns its result', await runHelpTool('publish_tick', { which: 'newest' }, globals), { ticked: 'newest' })
check('page_state runs as a tool', (await runHelpTool('page_state', {}, globals)).on_screen.publish.ticked, 2)
check('a throwing tool comes back as an error, not a throw', await runHelpTool('publish_go', {}, globals), { error: 'boom' })
check('an unknown tool says so', (await runHelpTool('nothing', {}, globals)).error.startsWith('No tool called nothing'), true)
check('a tool returning nothing is ok', await runHelpTool('go_to', {}, globals), { ok: true })
unregister()
check('unregistering removes the scope', listHelpTools(globals).map((t) => t.name), ['page_state', 'go_to'])
check('and its state', helpPageState().on_screen, {})
check('PAGE_STATE_TOOL has a description', PAGE_STATE_TOOL.description.length > 40, true)

// Loose matching.
const clients = [{ name: 'Prime Heating & Cooling' }, { name: 'Horizon HVAC' }, { name: 'Horizon Water Co' }, { name: 'Belk Plumbing' }]
check('exact name wins', looseMatch(clients, 'horizon hvac', (c) => c.name).map((c) => c.name), ['Horizon HVAC'])
check('a fragment matches by contains', looseMatch(clients, 'prime', (c) => c.name).map((c) => c.name), ['Prime Heating & Cooling'])
check('an ambiguous fragment returns both', looseMatch(clients, 'horizon', (c) => c.name).length, 2)
check('words in any order', looseMatch(clients, 'plumbing belk', (c) => c.name).map((c) => c.name), ['Belk Plumbing'])
check('nothing for nothing', looseMatch(clients, '', (c) => c.name), [])
check('nothing for a stranger', looseMatch(clients, 'zzz', (c) => c.name), [])

// The brief and the context.
const brief = buildHelpBrief({ today: new Date('2026-10-14') })
check('the brief names the role and the rules', /help assistant inside The Working Class Marketing/.test(brief) && /never call publish_go unless/.test(brief), true)
check('the brief carries the whole guide', /NAVIGATING THIS CRM/.test(brief) && /THINGS THAT WILL CATCH YOU OUT/.test(brief), true)
check('the brief says the date', /Today is 2026-10-14/.test(brief), true)
check('the brief is cacheable size, under 120k chars', brief.length < 120000, true)
const ctx = pageContextText({ path: '/publish/c1', title: 'Publish', on_screen: { publish: { ticked: 2 } } })
check('context names the page and the scope', ctx, 'Where I am: /publish/c1 (Publish).\npublish: {"ticked":2}')
check('context with nothing registered points at the openers', /open_publish/.test(pageContextText({ path: '/payments' })), true)
check('a huge state is cut', pageContextText({ path: '/x', on_screen: { a: { big: 'x'.repeat(9000) } } }).length < 6200, true)
check('four starters', HELP_SUGGESTIONS.length, 4)
check('tool labels read like actions', [toolLabel('make_ads', { client: 'Prime', count: 3 }), toolLabel('publish_go'), toolLabel('something_else')], ['Started 3 ads for Prime', 'Publish to Meta, paused', 'something else'])

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
