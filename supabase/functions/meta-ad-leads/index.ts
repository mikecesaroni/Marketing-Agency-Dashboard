// The people who filled in an ad's instant form, read back from Meta.
//
// POST { client_id, ad_id, limit? }
//
// Leads from Meta lead ads live on the Page, in Meta's Lead Center. This
// reads the ones for ONE ad so the CRM can show, under the ad, who came in
// from it: name, phone, email, their answers, and when. Nothing is stored;
// every open asks Meta again, so there is no second copy of anyone's phone
// number to look after.
//
// Two gates on Meta's side, both agency-side, neither the client's:
//   1. the System User token needs the leads_retrieval permission;
//   2. the System User needs Leads Access on the Page (Business Settings >
//      Integrations > Leads Access), or Meta answers with an empty list even
//      though the ad has leads.
// A refusal comes back with code 'needs_leads_access' and the fix spelled out.
//
// The ad id arrives in the request and the token can read every client's
// account, so the ad's account is checked against the client named, the same
// rule meta-manage applies to previews.
//
// Secrets: META_ACCESS_TOKEN.

const GRAPH = 'https://graph.facebook.com/v21.0'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  })
}

const env = (k: string) => (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k)
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')

async function graphGet(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`${GRAPH}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('access_token', token)
  const res = await fetch(url)
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const e = body?.error || {}
    const err = new Error(e.message || `Meta returned ${res.status}`) as Error & { code?: number; subcode?: number }
    err.code = Number(e.code)
    err.subcode = Number(e.error_subcode)
    throw err
  }
  return body
}

/** Meta's error for a missing permission, in words, with the fix. */
const LEADS_ACCESS_FIX =
  "Meta will not hand over lead details to the CRM's token yet. Two things on our side, no client action: (1) regenerate the System User token in Business Settings with leads_retrieval ticked and update META_ACCESS_TOKEN; (2) in Business Settings > Integrations > Leads Access, give the system user access to this Page's leads. Until then, the leads are in Meta's Lead Center on the Page."

export type Lead = {
  id: string
  at: string
  platform: string
  form_id: string
  name: string
  phone: string
  email: string
  answers: { question: string; answer: string }[]
}

const NAME_KEYS = new Set(['full_name', 'first_name', 'last_name', 'name'])
const PHONE_KEYS = new Set(['phone_number', 'phone', 'mobile_number'])
const EMAIL_KEYS = new Set(['email', 'email_address'])

/** Meta's field_data into a lead a person can read: who, how to reach them, and the rest as questions. */
export function toLead(raw: any): Lead {
  const fields: { name: string; values: string[] }[] = raw?.field_data || []
  let first = ''
  let last = ''
  let name = ''
  let phone = ''
  let email = ''
  const answers: { question: string; answer: string }[] = []
  for (const f of fields) {
    const key = String(f.name || '').toLowerCase()
    const value = (f.values || []).map((v) => String(v ?? '').trim()).filter(Boolean).join(', ')
    if (!value) continue
    if (key === 'first_name') first = value
    else if (key === 'last_name') last = value
    else if (NAME_KEYS.has(key)) name = value
    else if (PHONE_KEYS.has(key)) phone = value
    else if (EMAIL_KEYS.has(key)) email = value
    else answers.push({ question: prettyQuestion(key), answer: value })
  }
  return {
    id: String(raw?.id || ''),
    at: String(raw?.created_time || ''),
    platform: String(raw?.platform || ''),
    form_id: String(raw?.form_id || ''),
    name: name || [first, last].filter(Boolean).join(' '),
    phone,
    email,
    answers,
  }
}

/** "what_is_your_zip_code?" into "What is your zip code?" */
export function prettyQuestion(key: string): string {
  const s = String(key || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}

export async function serve(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return json({}, 200)
  const token = env('META_ACCESS_TOKEN')
  if (!token) return json({ error: 'META_ACCESS_TOKEN is not set on this project.' }, 500)
  const supabaseUrl = env('SUPABASE_URL')!
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')!

  let body: { client_id?: string; ad_id?: string; limit?: number }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }
  const adId = digits(body.ad_id)
  if (!body.client_id || !adId) return json({ error: 'client_id and ad_id are required' }, 400)

  const res = await fetch(`${supabaseUrl}/rest/v1/clients?id=eq.${encodeURIComponent(body.client_id)}&select=id,name,meta_ad_account_id`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  })
  const client = (await res.json().catch(() => null))?.[0]
  if (!client) return json({ error: 'No such client' }, 404)
  const account = digits(client.meta_ad_account_id)
  if (!account) return json({ error: `${client.name} has no Meta ad account on file.` }, 400)

  try {
    const ad = await graphGet(adId, { fields: 'id,name,account_id,effective_status' }, token)
    if (digits(ad?.account_id) !== account) return json({ error: `That ad does not belong to ${client.name}'s ad account.` }, 400)

    const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200)
    const page = await graphGet(`${adId}/leads`, { fields: 'id,created_time,field_data,form_id,platform', limit: String(limit) }, token)
    const leads = ((page?.data || []) as any[]).map(toLead).sort((a, b) => b.at.localeCompare(a.at))
    return json({ ok: true, ad_id: ad.id, ad_name: ad.name, status: ad.effective_status, leads, count: leads.length, more: Boolean(page?.paging?.next) })
  } catch (err) {
    const e = err as Error & { code?: number; subcode?: number }
    // (#200) permission, (#10) not allowed, (#190) bad token: all "we are not let in".
    if ([10, 190, 200, 294].includes(Number(e.code)) || /permission|leads_retrieval|not authorized/i.test(e.message)) {
      return json({ error: LEADS_ACCESS_FIX, code: 'needs_leads_access', detail: e.message }, 403)
    }
    return json({ error: e.message }, 500)
  }
}

const deno = (globalThis as { Deno?: { serve?: (h: (req: Request) => Promise<Response>) => void } }).Deno
if (typeof deno?.serve === 'function') deno.serve(serve)
