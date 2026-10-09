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
//                        image, thumb, video, video_id }], problems: [] }
//
// Body:  { token, action: 'preview', ad_id }
// Reply: { ad_id, iframe }   Meta's own rendered preview of one ad (an
//         <iframe> snippet), for playing a video whose file could not be
//         read. Only for an ad on this client's dashboard.

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
  // Internal: the ad image's hash when Meta gave no URL, resolved below.
  image_hash?: string | null
}

// One ad account id, however it is spelled.
const actId = (v: unknown) => {
  const s = String(v || '').trim()
  return s.startsWith('act_') ? s : `act_${s}`
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
// asset_feed_spec that Advantage+ creatives use. An ad published from the
// Studio carries its image as a hash with no URL at all, so the hash is
// asked for too and looked up on the account afterwards. The thumbnail is
// asked for at 1080px: Meta renders one for every creative, video posters
// included, so there is always a picture to show.
const CREATIVE_FIELDS =
  'id,creative.thumbnail_width(1080).thumbnail_height(1080){id,thumbnail_url,image_url,image_hash,video_id,' +
  'object_story_spec{video_data{video_id,image_url,image_hash},link_data{picture,image_hash}},' +
  'asset_feed_spec{videos{video_id,thumbnail_url},images{url,hash}}}'

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
    c.thumbnail_url ||
    null
  const hash =
    c.image_hash ||
    c.object_story_spec?.link_data?.image_hash ||
    c.object_story_spec?.video_data?.image_hash ||
    c.asset_feed_spec?.images?.[0]?.hash ||
    null
  return {
    ad_id: id,
    kind: videoId ? 'video' : image ? 'image' : 'unknown',
    image,
    thumb: c.thumbnail_url || null,
    video: null,
    video_id: videoId ? String(videoId) : null,
    image_hash: !videoId && !c.image_url && hash ? String(hash) : null,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const metaToken = Deno.env.get('META_ACCESS_TOKEN') || ''
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

  let body: { token?: string; action?: string; ad_id?: string } = {}
  try {
    body = await req.json()
  } catch {
    // no body: handled below
  }
  const dashToken = String(body.token || '').trim()
  if (dashToken.length < 20) return json({ error: 'token is required.' }, 400)

  // What went wrong on the way, in words, so a blank card can be explained
  // from the CRM without guessing. Never a secret: Meta's own messages.
  const problems: string[] = []
  const note = (step: string, err: unknown) => {
    if (problems.length < 6) problems.push(`${step}: ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    const clientRes = await fetch(
      `${supabaseUrl}/rest/v1/clients?select=id,name,meta_ad_account_id&archived=eq.false&dashboard_token=eq.${encodeURIComponent(dashToken)}`,
      { headers }
    )
    const client = ((await clientRes.json()) || [])[0]
    if (!client) return json({ error: 'This link is not valid.' }, 404)
    if (!client.meta_ad_account_id || !metaToken) return json({ creatives: [], problems: [] })
    const account = actId(client.meta_ad_account_id)

    // -------------------------------------------------------------------
    // PREVIEW: Meta draws the ad as it appears in the feed, video player
    // and all. Asked for when a video's own file cannot be read. The ad
    // has to be one of this client's, from their own daily rows.
    // -------------------------------------------------------------------
    if (body.action === 'preview') {
      const adId = String(body.ad_id || '').trim()
      if (!/^\d{5,}$/.test(adId)) return json({ error: 'ad_id is required.' }, 400)
      const own = await fetch(
        `${supabaseUrl}/rest/v1/ad_daily?select=ad_id&client_id=eq.${encodeURIComponent(client.id)}&ad_id=eq.${encodeURIComponent(adId)}&limit=1`,
        { headers }
      )
      if (!(((await own.json()) || []) as unknown[]).length) return json({ error: 'That ad is not on this dashboard.' }, 404)
      try {
        const res = await graphGet(`${encodeURIComponent(adId)}/previews`, { ad_format: 'MOBILE_FEED_STANDARD' }, metaToken)
        const iframe = (res?.data || [])[0]?.body || null
        return json({ ad_id: adId, iframe, problems })
      } catch (err) {
        note('preview', err)
        return json({ ad_id: adId, iframe: null, problems })
      }
    }

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
    if (!ids.length) return json({ creatives: [], problems })

    const creatives: Creative[] = []
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50)
      try {
        const batch = await graphGet('', { ids: chunk.join(','), fields: CREATIVE_FIELDS }, metaToken)
        for (const id of chunk) {
          const c = fromAd(id, batch?.[id])
          if (c) creatives.push(c)
        }
      } catch (err) {
        // One bad id fails the whole batch, so fall back to one at a time
        // for the first thirty. An ad this token cannot read simply has
        // no preview; the card still shows its name and numbers.
        note('creatives', err)
        for (const id of chunk.slice(0, 30)) {
          try {
            const c = fromAd(id, await graphGet(encodeURIComponent(id), { fields: CREATIVE_FIELDS }, metaToken))
            if (c) creatives.push(c)
          } catch (e) {
            note(`creative ${id}`, e)
          }
        }
      }
    }

    // Images the Studio published are stored on the account by hash, with
    // no URL on the creative. The account's image library has the file.
    const hashes = [...new Set(creatives.map((c) => c.image_hash).filter(Boolean))] as string[]
    for (let i = 0; i < hashes.length; i += 50) {
      const chunk = hashes.slice(i, i + 50)
      try {
        const res = await graphGet(`${account}/adimages`, { hashes: JSON.stringify(chunk), fields: 'hash,url' }, metaToken)
        const urlBy = new Map<string, string>()
        for (const img of res?.data || []) if (img?.hash && img?.url) urlBy.set(String(img.hash), String(img.url))
        for (const c of creatives) {
          const url = c.image_hash ? urlBy.get(c.image_hash) : null
          if (url) {
            c.image = url
            c.kind = c.kind === 'unknown' ? 'image' : c.kind
          }
        }
      } catch (err) {
        note('images', err)
      }
    }

    // The playable file behind each video ad. `source` is a signed URL that
    // expires, which is fine: the page uses it straight away. When Meta will
    // not hand it over (a video owned by the Page rather than the account),
    // the page asks for the rendered preview instead.
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
      } catch (err) {
        note('videos', err)
        for (const vid of chunk.slice(0, 30)) {
          try {
            const v = await graphGet(encodeURIComponent(vid), { fields: 'id,source,picture' }, metaToken)
            for (const c of creatives) {
              if (c.video_id !== vid) continue
              c.video = v.source || null
              if (!c.image && v.picture) c.image = v.picture
            }
          } catch (e) {
            note(`video ${vid}`, e)
          }
        }
      }
    }

    for (const c of creatives) delete c.image_hash
    return json({ creatives, problems })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
