import { supabase } from './supabaseClient'
import { helpPageState, helpScopes, looseMatch } from './helpActions'

/**
 * The tools the help chat has on every page: finding a client and opening
 * the right page for the job. The page-specific ones (ticking a creative,
 * setting a budget, saving an ad) are registered by the panels themselves.
 */

async function activeClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, industry, market, archived, meta_ad_account_id')
    .order('name')
  if (error) throw error
  return (data || []).filter((c) => !c.archived)
}

async function findClient(query) {
  const clients = await activeClients()
  const found = looseMatch(clients, query, (c) => c.name)
  if (found.length === 1) return { client: found[0] }
  if (found.length === 0) return { error: `No client matches "${query}". Clients: ${clients.map((c) => c.name).join(', ')}.` }
  return { error: `Several clients match "${query}": ${found.map((c) => c.name).join(', ')}. Ask which.` }
}

/** Waits for a page to register something after a navigation, up to about 4 seconds. */
async function settle(path) {
  for (let i = 0; i < 20; i++) {
    const state = helpPageState()
    if (state.path === path && helpScopes().length > 0) return state
    await new Promise((r) => setTimeout(r, 200))
  }
  return helpPageState()
}

export function globalHelpTools({ navigate }) {
  const go = async (path) => {
    navigate(path)
    const state = await settle(path.split('?')[0])
    return { ok: true, now: state }
  }
  return [
    {
      name: 'list_clients',
      description: 'Every active client with their trade and market, for matching a name the user typed.',
      input_schema: { type: 'object', properties: {} },
      run: async () => ({ clients: (await activeClients()).map((c) => ({ name: c.name, industry: c.industry, market: c.market, meta: Boolean(c.meta_ad_account_id) })) }),
    },
    {
      name: 'open_client',
      description: "Open a client's page (their intake, ads, files, AI videos, chat).",
      input_schema: { type: 'object', properties: { client: { type: 'string', description: 'Client name, loosely matched' } }, required: ['client'] },
      run: async ({ client }) => {
        const f = await findClient(client)
        if (f.error) return f
        return go(`/client/${f.client.id}`)
      },
    },
    {
      name: 'make_ads',
      description: "Open a client's Ad Studio already writing N ads from their brief (the Content tab's \"Make 3 ads\"). The ads take about half a minute; call page_state afterwards to see them, then studio_save_batch to save them all.",
      input_schema: {
        type: 'object',
        properties: { client: { type: 'string' }, count: { type: 'integer', minimum: 1, maximum: 6, description: 'Default 3' } },
        required: ['client'],
      },
      run: async ({ client, count }) => {
        const f = await findClient(client)
        if (f.error) return f
        const n = Math.max(1, Math.min(6, Number(count) || 3))
        return go(`/client/${f.client.id}?open=studio&make=${n}`)
      },
    },
    {
      name: 'open_studio',
      description: "Open a client's Ad Studio empty, to design one ad by hand or to reach their Saved ads tab.",
      input_schema: { type: 'object', properties: { client: { type: 'string' } }, required: ['client'] },
      run: async ({ client }) => {
        const f = await findClient(client)
        if (f.error) return f
        return go(`/client/${f.client.id}?open=studio`)
      },
    },
    {
      name: 'open_publish',
      description: "Open a client's publish page: their clips and saved statics, the words, where it goes, and the Publish button.",
      input_schema: { type: 'object', properties: { client: { type: 'string' } }, required: ['client'] },
      run: async ({ client }) => {
        const f = await findClient(client)
        if (f.error) return f
        return go(`/publish/${f.client.id}`)
      },
    },
    {
      name: 'go_to',
      description: 'Open a page of the CRM by its path from the guide, for example /content?tab=publish or /payments.',
      input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      run: async ({ path }) => {
        const p = String(path || '')
        if (!p.startsWith('/') || p.startsWith('//')) return { error: 'Only a path inside the CRM, starting with /.' }
        return go(p)
      },
    },
  ]
}
