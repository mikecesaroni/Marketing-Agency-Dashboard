// Which Anthropic organization the CRM's API key belongs to.
//
// 2026-11-12: the Team plan's API credit sits in one Console organization
// and the question was whether the CRM's key is in that one or in another
// that bills a card. Every API response carries the organization id of
// the key that made it, so this asks for the model list (free) with the
// key in ANTHROPIC_API_KEY and returns that id and nothing else: no key,
// no prefix, no models. Compare the id with the organization settings in
// the Console.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)
  const key = Deno.env.get('ANTHROPIC_API_KEY') || ''
  if (!key) return json({ error: 'ANTHROPIC_API_KEY is not set.' }, 500)
  const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
  })
  const body = await res.json().catch(() => ({}))
  return json({
    ok: res.ok,
    status: res.status,
    organization_id: res.headers.get('anthropic-organization-id') || null,
    request_id: res.headers.get('request-id') || null,
    error: res.ok ? undefined : body?.error?.message || `Anthropic returned ${res.status}`,
  })
})
