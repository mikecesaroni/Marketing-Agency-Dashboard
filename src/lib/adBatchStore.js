import { supabase } from './supabaseClient'
import { buildBrief } from './clientBrief'
import { fetchLearnings } from './adLearningsStore'
import { fetchLandingPages } from './landingPagesStore'
import { creativeSetToStudio, extractCreativeSets, renderBlocks, sendChatMessage } from './clientChat'
import { listDriveImages, resolveImageSrc } from './driveAssets'
import { BATCH_PHOTO_MAX, assignPhotos, chooseLooks, makeAdsPrompt, photoPool, tilesFrom } from './adBatch'
import { isLookKey } from './adTemplateMeta'
import { TRADE_WORDS, phaseOf, playbookText } from './seasonPlaybook'

/**
 * Three ads in one go: the network half.
 *
 * Asks the client's chat (the same brief and the same model as the chat on
 * their page) for three creative sets, shows it the client's photos so each
 * ad gets the one that fits, maps the sets onto the Studio's slots and gives
 * each a look. The turn is transient: the photos would otherwise sit in the
 * conversation and cost every later message. Nothing is saved here; the
 * Studio shows the three and saves on a click.
 *
 * Colours are deliberately not taken from the chat. The Studio reads them
 * off the logo (or the intake's stated brand colours), and a hex the model
 * guessed was replacing that with something that matched nothing.
 */

/** A photo as a small JPEG, base64, for the model to look at. Throws when it cannot be loaded (a HEIC upload). */
export async function smallImage(src, max = 800) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Could not load the photo'))
    el.src = src
  })
  const scale = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round((img.naturalWidth || 1) * scale))
  canvas.height = Math.max(1, Math.round((img.naturalHeight || 1) * scale))
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
  return { data: dataUrl.split(',')[1], media_type: 'image/jpeg' }
}

/**
 * Writes `count` sets for the client. Resolves to the mapped sets, each with
 * `layout` and `backgroundPath` set. Throws with a plain reason when the chat
 * is not deployed, the key is missing, or no JSON came back.
 */
export async function makeAdBatch({ client, intake, ads = [], count = 3, template = '', about = '' }) {
  const [learnings, pages, files, drive] = await Promise.all([
    fetchLearnings(client.id).catch(() => []),
    fetchLandingPages(client.id).catch(() => []),
    supabase
      .from('client_files')
      .select('file_name, storage_path, date_uploaded')
      .eq('client_id', client.id)
      .then(({ data }) => data || []),
    listDriveImages(client.id).catch(() => []),
  ])

  // The photos the chat gets to see: the newest few that the browser can
  // decode, uploads and Drive alike. Numbered as sent, so a pick maps back.
  const pool = photoPool({ files, drive })
  const shown = []
  const images = []
  for (const p of pool.slice(0, BATCH_PHOTO_MAX)) {
    try {
      const img = await smallImage(await resolveImageSrc(client.id, p.path))
      if (!img) continue
      shown.push(p)
      images.push(img)
    } catch {
      // Not decodable here (a HEIC upload, a Drive file that would not render). Still in the pool for the fallback.
    }
  }

  // The season playbook: what this trade sells right now in this market,
  // which decides the tactics the chat writes to and the template each ad
  // lands on (src/lib/seasonPlaybook.js).
  const industry = intake?.industry_trade || client.industry || ''
  const market = intake?.service_area || client.market || ''
  const phase = phaseOf({ industry, market })
  const playbook = playbookText(phase, { tradeWords: TRADE_WORDS[phase.trade] || 'home services', market })

  const system = buildBrief({ client, intake, ads, learnings, pages })
  const data = await sendChatMessage({
    clientId: client.id,
    system,
    message: makeAdsPrompt({ count, clientName: client.name, photos: shown, playbook, template, about }),
    images,
    transient: true,
  })

  const text = renderBlocks(data?.content || [])
  const raw = extractCreativeSets(text) || []
  if (raw.length === 0) {
    throw new Error('The chat wrote no creative sets this time. Open the chat and ask it for three ads, or try again.')
  }
  // The template extras: the sticker and the tiles the chat wrote; the
  // kicker, the painted background and the unit in the corner from the
  // playbook (all editable on the form).
  const forced = isLookKey(template) ? template : ''
  const sets = raw.slice(0, count).map((r) => {
    const mapped = creativeSetToStudio(r)
    return {
      ...mapped,
      // The chat's pick is a suggestion chooseLooks() weighs; an ask that
      // named a template is the look, full stop.
      layout: forced,
      suggestedLayout: mapped.layout || '',
      accent: '',
      badgeColor: '',
      kicker: phase.kicker || '',
      sticker: String(r.sticker || '').trim(),
      offers: tilesFrom(r.offers),
      cutout: phase.cutout || '',
      theme: phase.theme || '',
    }
  })
  const picks = raw.slice(0, count).map((r) => Number(r.photo) || 0)
  return assignPhotos(chooseLooks(sets, { phase, hasPhoto: pool.length > 0 }), { pool, shown, picks })
}

/**
 * The batch waits for you. The last batch made for a client is kept in
 * ad_batches (one row per client, supabase/ad-batches.sql) with every edit
 * made on its sets, until it is saved or dropped on purpose, so the Studio
 * can be left mid-review and reopened days later with the same three on
 * the strip.
 */
export async function loadBatchDraft(clientId) {
  const { data, error } = await supabase
    .from('ad_batches')
    .select('sets, active, count, made_at, updated_at')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw error
  if (!data || !Array.isArray(data.sets) || data.sets.length === 0) return null
  return data
}

/** Writes the batch as it stands (its sets with their edits, which one is up). */
export async function saveBatchDraft(clientId, batch) {
  if (!batch || !Array.isArray(batch.sets) || batch.sets.length === 0) return
  const { error } = await supabase.from('ad_batches').upsert(
    {
      client_id: clientId,
      sets: batch.sets,
      active: batch.active || 0,
      count: batch.sets.length,
      made_at: batch.madeAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' }
  )
  if (error) throw error
}

/** Drops the kept batch: after "Save all", or "Forget these" on the strip. */
export async function forgetBatchDraft(clientId) {
  const { error } = await supabase.from('ad_batches').delete().eq('client_id', clientId)
  if (error) throw error
}
