import { supabase } from './supabaseClient'
import { buildBrief } from './clientBrief'
import { fetchLearnings } from './adLearningsStore'
import { fetchLandingPages } from './landingPagesStore'
import { creativeSetToStudio, extractCreativeSets, renderBlocks, sendChatMessage } from './clientChat'
import { listDriveImages, resolveImageSrc } from './driveAssets'
import { BATCH_PHOTO_MAX, assignLooks, assignPhotos, cutoutFor, makeAdsPrompt, photoPool, tilesFrom } from './adBatch'

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

/** A photo as a small JPEG, base64, for the model to look at. Null when it cannot be loaded (a HEIC upload). */
async function smallImage(src, max = 800) {
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
export async function makeAdBatch({ client, intake, ads = [], count = 3 }) {
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

  const system = buildBrief({ client, intake, ads, learnings, pages })
  const data = await sendChatMessage({
    clientId: client.id,
    system,
    message: makeAdsPrompt({ count, clientName: client.name, photos: shown }),
    images,
    transient: true,
  })

  const text = renderBlocks(data?.content || [])
  const raw = extractCreativeSets(text) || []
  if (raw.length === 0) {
    throw new Error('The chat wrote no creative sets this time. Open the chat and ask it for three ads, or try again.')
  }
  // The template extras: the sticker and the tiles the chat wrote, the unit
  // for the trade and the month; the kicker and the theme follow the season.
  const cutout = cutoutFor(client.industry)
  const sets = raw.slice(0, count).map((r) => ({
    ...creativeSetToStudio(r),
    accent: '',
    badgeColor: '',
    kicker: '',
    sticker: String(r.sticker || '').trim(),
    offers: tilesFrom(r.offers),
    cutout,
    theme: '',
  }))
  const picks = raw.slice(0, count).map((r) => Number(r.photo) || 0)
  return assignPhotos(assignLooks(sets), { pool, shown, picks })
}
