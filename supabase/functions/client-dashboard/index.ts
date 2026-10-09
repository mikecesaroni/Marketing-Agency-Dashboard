// Client dashboard: what the ads look like.
//
// The dashboard page (/dashboard/<token>) reads its numbers through the
// client_dashboard_load SQL function. What the database cannot give it is
// the creative itself: Meta's image, thumbnail and video URLs are signed
// and expire, so they are fetched at the moment the dashboard opens and
// never stored (the same reasoning as meta-manage's ad_preview). One call
// per open: every ad with spend or leads in the last 90 days, fifty at a
// time, then the playable file behind each video ad.
//
// Deployed with verify_jwt = true; the browser calls it with the anon key.
// The dashboard token is the credential: it names the client, the ad ids
// come from that client's own ad_daily rows and never from the request,
// and nothing here can change anything.
//
// Secrets: META_ACCESS_TOKEN (the same System User token everything uses).
//
// Body:  { token }
// Reply: { creatives: [{ ad_id, kind: 'image' | 'video' | 'unknown',
//                        image, thumb, video, video_id }] }

const META_API_VERSION = 'v21.0'
const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Creative = {
  ad_id: string
  kind: 'image' | 'video' | 'unknown'
  image: string | null
  thumb: string | null
  video: string | null
  video_id: string | null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

async function graphGet(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`${GRAPH}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('access_token', token)
  const res = await fetch(url)
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error?.message || `Meta returned ${res.status}`)
  return body
}

const pad = (n: number) => String(n).padStart(2, '0')
function isoDaysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Every shape a creative's picture and video can hide in: a plain image ad,
// a video ad (video_data), a link ad (link_data), and the dynamic
// asset_feed_spec that Advantage+ creatives use.
const CREATIVE_FIELDS =
  'id,creative{id,thumbnail_url,image_url,video_id,' +
  'object_story_spec{video_data{video_id,image_url},link_data{picture}},' +
  'asset_feed_spec{videos{video_id,thumbnail_url},images{url}}}'

function fromAd(id: string, ad: any): Creative | null {
  const c = ad?.creative
  if (!c) return null
  const videoId =
    c.video_id || c.object_story_spec?.video_data?.video_id || c.asset_feed_spec?.videos?.[0]?.video_id || null
  const image =
    c.image_url ||
    c.object_story_spec?.video_data?.image_url ||
    c.object_story_spec?.link_data?.picture ||
    c.asset_feed_spec?.images?.[0]?.url ||
    c.asset_feed_spec?.videos?.[0]?.thumbnail_url ||
    null
  return {
    ad_id: id,
    kind: videoId ? 'video' : image ? 'image' : 'unknown',
    image,
    thumb: c.thumbnail_url || null,
    video: null,
    video_id: videoId ? String(videoId) : null,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const metaToken = Deno.env.get('META_ACCESS_TOKEN') || ''
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

  let body: { token?: string } = {}
  try {
    body = await req.json()
  } catch {
    // no body: handled below
  }
  const dashToken = String(body.token || '').trim()
  if (dashToken.length < 20) return json({ error: 'token is required.' }, 400)

  try {
    const clientRes = await fetch(
      `${supabaseUrl}/rest/v1/clients?select=id,name,meta_ad_account_id&archived=eq.false&dashboard_token=eq.${encodeURIComponent(dashToken)}`,
      { headers }
    )
    const client = ((await clientRes.json()) || [])[0]
    if (!client) return json({ error: 'This link is not valid.' }, 404)
    if (!client.meta_ad_account_id || !metaToken) return json({ creatives: [] })

    // The ads that ran in the last 90 days, biggest first, at most 100.
    const rowsRes = await fetch(
      `${supabaseUrl}/rest/v1/ad_daily?select=ad_id,spend,leads&client_id=eq.${encodeURIComponent(client.id)}&date=gte.${isoDaysAgo(89)}&limit=20000`,
      { headers }
    )
    const rows = ((await rowsRes.json()) || []) as { ad_id: string; spend: number; leads: number }[]
    const weight = new Map<string, number>()
    for (const r of rows) {
      if (!r.ad_id) continue
      weight.set(r.ad_id, (weight.get(r.ad_id) || 0) + Number(r.spend || 0) + Number(r.leads || 0))
    }
    const ids = [...weight.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100)
      .map(([id]) => id)
    if (!ids.length) return json({ creatives: [] })

    const creatives: Creative[] = []
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50)
      try {
        const batch = await graphGet('', { ids: chunk.join(','), fields: CREATIVE_FIELDS }, metaToken)
        for (const id of chunk) {
          const c = fromAd(id, batch?.[id])
          if (c) creatives.push(c)
        }
      } catch {
        // One bad id fails the whole batch, so fall back to one at a time
        // for the first thirty. An ad this token cannot read simply has
        // no preview; the card still shows its name and numbers.
        for (const id of chunk.slice(0, 30)) {
          try {
            const c = fromAd(id, await graphGet(encodeURIComponent(id), { fields: CREATIVE_FIELDS }, metaToken))
            if (c) creatives.push(c)
          } catch {
            // no preview for this one
          }
        }
      }
    }

    // The playable file behind each video ad. `source` is a signed URL that
    // expires, which is fine: the page uses it straight away.
    const videoIds = [...new Set(creatives.map((c) => c.video_id).filter(Boolean))] as string[]
    for (let i = 0; i < videoIds.length; i += 50) {
      const chunk = videoIds.slice(i, i + 50)
      try {
        const batch = await graphGet('', { ids: chunk.join(','), fields: 'id,source,picture' }, metaToken)
        for (const c of creatives) {
          const v = c.video_id ? batch?.[c.video_id] : null
          if (!v) continue
          c.video = v.source || null
          if (!c.image && v.picture) c.image = v.picture
        }
      } catch {
        for (const vid of chunk.slice(0, 30)) {
          try {
            const v = await graphGet(encodeURIComponent(vid), { fields: 'id,source,picture' }, metaToken)
            for (const c of creatives) {
              if (c.video_id !== vid) continue
              c.video = v.source || null
              if (!c.image && v.picture) c.image = v.picture
            }
          } catch {
            // the picture from the creative still stands in
          }
        }
      }
    }

    return json({ creatives })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
