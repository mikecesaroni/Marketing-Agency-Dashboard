import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'
import { kickerFor, offersFor } from './adTemplateMeta'
import { AI_ART_PREFIX, AI_TEMPLATE_KEYS, STYLE_REF_PREFIX, isAiTemplate, latestAiArt } from '../../supabase/functions/_shared/aiAds.js'

/**
 * Ads made by ChatGPT's image model, the network half. The ai-ads Edge
 * Function paints a template as a finished poster in the style of the
 * agency's example ads (the style library at stock/style-refs/) with the
 * real unit photo in it; the Studio lays it into each size and paints the
 * client's logo and the Google card on the band it leaves. The pure half
 * (the art direction, the prompt, the paths) is shared with the function
 * in supabase/functions/_shared/aiAds.js.
 */

export { AI_TEMPLATE_KEYS, isAiTemplate }

const BUCKET = 'client-files'
const UNITS = ['ac', 'furnace', 'boiler', 'water_heater', 'mini_split', 'thermostat']

/** The ad's words, in reading order and in the roles the prompt names, from the Studio's fields. */
export function aiWordsFor(content) {
  const words = []
  const add = (role, text) => {
    const t = String(text || '').replace(/\s+/g, ' ').trim()
    if (t) words.push({ role, text: t })
  }
  const t = content?.layout
  add('Small pill at the top', content?.badge)
  add('Kicker', kickerFor(content))
  add('Headline', content?.hook)
  if (['price_grid', 'fall_special', 'financing'].includes(t)) {
    offersFor(content).forEach((o, i) => add(`Offer ${i + 1}`, [o.amount, o.detail].filter(Boolean).join(' ')))
  } else {
    add('Price', content?.offerAmount)
    add('Line under the price', content?.offerDetail)
  }
  if (['feature_list', 'plan_card'].includes(t)) {
    String(content?.subhead || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5)
      .forEach((item) => add('Ticked item', item))
  } else add('Supporting line', content?.subhead)
  add('Sticker', content?.sticker)
  return words
}

/** The unit key to put in the picture, from the Studio's equipment pick. */
export function aiUnitFor(content) {
  const c = String(content?.cutout || '')
  return UNITS.includes(c) ? c : ''
}

/** The client's made pictures, newest per template and shape: { [template]: { square, tall, stamp } }. */
export async function listAiArt(clientId) {
  const { data, error } = await supabase.storage.from(BUCKET).list(`${AI_ART_PREFIX}${clientId}`, { limit: 1000 })
  if (error) throw error
  return latestAiArt((data || []).map((f) => f.name), clientId)
}

export const aiArtUrl = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

/** Asks ChatGPT for one picture of the template in one shape. Returns { path }. Takes a minute or two. */
export async function makeAiArt({ clientId, content, shape }) {
  const { data, error } = await supabase.functions.invoke('ai-ads', {
    body: {
      action: 'make',
      client_id: clientId,
      template: content.layout,
      shape,
      words: aiWordsFor(content),
      unit: aiUnitFor(content),
      colours: [content.badgeColor, content.accent].filter((c) => /^#[0-9a-f]{6}$/i.test(String(c || ''))),
      season: content.season || '',
    },
  })
  if (error) {
    const { status, detail } = await readFunctionError(error)
    if (status === 404 || /not found|404/i.test(detail)) throw new Error('The ai-ads function is not deployed yet.')
    throw new Error(detail || 'ChatGPT did not send the ad back. Try again in a moment.')
  }
  if (data?.error) throw new Error(data.error)
  return data
}

/** The example ads ChatGPT copies the style of: [{ name, path, url }]. */
export async function listStyleRefs() {
  const { data, error } = await supabase.storage.from(BUCKET).list(STYLE_REF_PREFIX.replace(/\/$/, ''), { limit: 100 })
  if (error) throw error
  return (data || [])
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name || ''))
    .map((f) => ({ name: f.name, path: `${STYLE_REF_PREFIX}${f.name}`, url: aiArtUrl(`${STYLE_REF_PREFIX}${f.name}`) }))
}

/** Adds an example ad to the style library (every client's ChatGPT ads follow it). */
export async function addStyleRef(file) {
  const ext = /png$/i.test(file.type) ? 'png' : /webp$/i.test(file.type) ? 'webp' : 'jpg'
  const base = String(file.name || 'example').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'example'
  const path = `${STYLE_REF_PREFIX}${base}-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg' })
  if (error) throw error
  return path
}

export async function removeStyleRef(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}
