/**
 * What the help chat can do on the page in front of the user.
 *
 * Pages and panels register a scope (the publish page, the Studio, a client
 * page) with the tools it offers and a function that describes its state.
 * The chat lists every registered tool for the model and runs the one it
 * asks for; `page_state` is always there and is the sum of every scope's
 * state, so "finish what I started" begins with a look at the screen.
 *
 * No React in here (scripts/check-help-chat.mjs runs it in Node); the hook
 * that registers from a component is in useHelpActions.js.
 */

const scopes = new Map()
const listeners = new Set()
let pageMeta = { path: '', title: '' }

function notify() {
  for (const fn of listeners) fn()
}

/** Registers a scope. Returns the function that removes it again. */
export function registerHelpActions(scope, { label = '', tools = [], state = null } = {}) {
  const entry = { label, tools, state }
  scopes.set(scope, entry)
  notify()
  return () => {
    if (scopes.get(scope) === entry) {
      scopes.delete(scope)
      notify()
    }
  }
}

export function subscribeHelpActions(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Where the user is, as the router sees it. Set by the chat on every navigation. */
export function setHelpPage(meta) {
  pageMeta = { ...pageMeta, ...meta }
}

export function helpScopes() {
  return [...scopes.entries()].map(([scope, e]) => ({ scope, label: e.label }))
}

/** The state of everything on screen, by scope. */
export function helpPageState() {
  const out = { path: pageMeta.path, title: pageMeta.title, on_screen: {} }
  for (const [scope, e] of scopes) {
    try {
      out.on_screen[scope] = e.state ? e.state() : { label: e.label }
    } catch (err) {
      out.on_screen[scope] = { error: err.message }
    }
  }
  return out
}

export const PAGE_STATE_TOOL = {
  name: 'page_state',
  description:
    'What is on the screen right now: the page, and for each panel that can be acted on (the publish page, the Studio, a client page) its fields, what is ticked, what is still missing. Call it before finishing something the user started, and again after acting to see the result.',
  input_schema: { type: 'object', properties: {} },
}

/** Every tool the model may call right now: the global ones, page_state, and each scope's. */
export function listHelpTools(globalTools = []) {
  const all = [PAGE_STATE_TOOL, ...globalTools]
  for (const e of scopes.values()) all.push(...e.tools)
  const seen = new Set()
  return all
    .filter((t) => {
      if (!t?.name || seen.has(t.name)) return false
      seen.add(t.name)
      return true
    })
    .map(({ name, description, input_schema }) => ({ name, description, input_schema: input_schema || { type: 'object', properties: {} } }))
}

/** The full definition (with run and confirm) for one tool, or null. */
export function findHelpTool(name, globalTools = []) {
  if (name === PAGE_STATE_TOOL.name) return { ...PAGE_STATE_TOOL, run: () => helpPageState() }
  for (const t of globalTools) if (t.name === name) return t
  for (const e of scopes.values()) for (const t of e.tools) if (t.name === name) return t
  return null
}

/**
 * Runs one tool. Never throws: an error comes back as {error} so the model
 * can read it and try something else.
 */
export async function runHelpTool(name, input, globalTools = []) {
  const tool = findHelpTool(name, globalTools)
  if (!tool) return { error: `No tool called ${name} on this page. Call page_state to see what is here.` }
  try {
    const out = await tool.run(input || {})
    return out === undefined ? { ok: true } : out
  } catch (err) {
    return { error: err?.message || String(err) }
  }
}

/** Matches a name loosely: case-insensitive, any word of the query inside the name. */
export function looseMatch(items, query, getName = (x) => x) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return []
  const exact = items.filter((x) => String(getName(x) || '').toLowerCase() === q)
  if (exact.length) return exact
  const contains = items.filter((x) => String(getName(x) || '').toLowerCase().includes(q))
  if (contains.length) return contains
  const words = q.split(/\s+/).filter((w) => w.length > 2)
  return items.filter((x) => {
    const name = String(getName(x) || '').toLowerCase()
    return words.length > 0 && words.every((w) => name.includes(w))
  })
}

/** For tests and the "New chat" button: forget every scope. */
export function resetHelpActions() {
  scopes.clear()
  pageMeta = { path: '', title: '' }
  notify()
}
