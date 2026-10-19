import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'
import { TEMPLATE_ART_KEYS, TEMPLATE_ART_PREFIX, parseTemplateArtName, templateArtPath } from '../../supabase/functions/_shared/aiAds.js'

/**
 * The ChatGPT templates, the network half. ChatGPT paints the art behind
 * the templates once (the sunburst, the clouds, the snow, the torn paper;
 * no words, no product), at stock/template-art/<key>-<shape>.jpg, shared by
 * every client. The Studio loads the pictures into the paint assets as
 * `templateArt` ({ key: { square, tall } }) and paintTheme in adTemplates.js
 * paints them in place of the drawn backgrounds; the words, the prices, the
 * unit photo and the logo stay the client's, painted on top. The pure half
 * (the art direction, the paths) is in supabase/functions/_shared/aiAds.js.
 */

export { TEMPLATE_ART_KEYS }

const BUCKET = 'client-files'

/** The art that exists: { key: { square: url, tall: url } }. Each url carries its file's stamp so a remake shows. */
export async function listTemplateArt() {
  const { data, error } = await supabase.storage.from(BUCKET).list(TEMPLATE_ART_PREFIX.replace(/\/$/, ''), { limit: 200 })
  if (error) throw error
  const out = {}
  for (const f of data || []) {
    const p = parseTemplateArtName(f.name)
    if (!p) continue
    const base = supabase.storage.from(BUCKET).getPublicUrl(templateArtPath(p.key, p.shape)).data.publicUrl
    const stamp = f.updated_at || f.created_at || ''
    ;(out[p.key] ||= {})[p.shape] = stamp ? `${base}?v=${encodeURIComponent(stamp)}` : base
  }
  return out
}

/** How many of the pictures there are, of how many: { made, of }. */
export function templateArtCount(list) {
  const made = TEMPLATE_ART_KEYS.reduce((n, k) => n + (list?.[k]?.square ? 1 : 0) + (list?.[k]?.tall ? 1 : 0), 0)
  return { made, of: TEMPLATE_ART_KEYS.length * 2 }
}

/** Bitmaps for every picture there is: { key: { square, tall } }. One that will not load is left out; the drawn theme stands in. */
export async function loadTemplateArt(list, loadImage) {
  const out = {}
  await Promise.all(
    Object.entries(list || {}).flatMap(([key, shapes]) =>
      Object.entries(shapes).map(async ([shape, url]) => {
        try {
          const img = await loadImage(url)
          if (img) (out[key] ||= {})[shape] = img
        } catch {
          // left out on purpose
        }
      })
    )
  )
  return out
}

let shared = null
/** The bitmaps, loaded once per page and shared by the Studio, the gallery and a revision. `fresh` reloads after a make. */
export function templateArtBitmaps(loadImage, { fresh = false } = {}) {
  if (!shared || fresh) {
    shared = listTemplateArt()
      .then((list) => loadTemplateArt(list, loadImage).then((pictures) => ({ list, pictures })))
      .catch(() => ({ list: {}, pictures: {} }))
  }
  return shared
}

/** Has ChatGPT paint one picture of template art (about a minute). Returns { path }. */
export async function makeTemplateArt(key, shape, { quality = 'high' } = {}) {
  const { data, error } = await supabase.functions.invoke('ai-ads', { body: { action: 'art', key, shape, quality } })
  if (error) {
    const { status, detail } = await readFunctionError(error)
    if (status === 404 || /not found|404/i.test(detail)) throw new Error('The ai-ads function is not deployed yet.')
    throw new Error(detail || 'ChatGPT did not send the picture back. Try again in a moment.')
  }
  if (data?.error) throw new Error(data.error)
  return data
}
