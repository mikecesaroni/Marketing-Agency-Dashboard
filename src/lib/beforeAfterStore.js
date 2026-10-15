import { supabase } from './supabaseClient'
import { listDriveImages, resolveImageSrc } from './driveAssets'
import { photoPool } from './adBatch'
import { renderBlocks, sendChatMessage } from './clientChat'
import { smallImage } from './adBatchStore'
import { FINDER_SYSTEM, finderPrompt, pairsByName, parsePairs } from './beforeAfter'
import { tradeOf } from './season.js'
import { TRADE_WORDS } from './seasonPlaybook'

/** How many photos the model is shown. Past this the turn gets slow and the pairs no better. */
export const FINDER_MAX = 16

/**
 * Finds before-and-after pairs among the client's uploads and Drive photos.
 * Names first (free and sure), then the model on the newest photos. Resolves
 * to { pairs, looked, how } where each pair carries the two photos with
 * their URLs for a thumbnail, and `looked` is how many photos were
 * considered.
 */
export async function findBeforeAfterPairs({ client, intake, limit = FINDER_MAX }) {
  const [files, drive] = await Promise.all([
    supabase
      .from('client_files')
      .select('file_name, storage_path, date_uploaded')
      .eq('client_id', client.id)
      .then(({ data }) => data || []),
    listDriveImages(client.id).catch(() => []),
  ])
  const pool = photoPool({ files, drive })
  const withUrls = async (pairs) => {
    const out = []
    for (const p of pairs) {
      out.push({ ...p, beforeUrl: await resolveImageSrc(client.id, p.before.path).catch(() => ''), afterUrl: await resolveImageSrc(client.id, p.after.path).catch(() => '') })
    }
    return out
  }
  const named = pairsByName(pool)
  if (named.length) return { pairs: await withUrls(named), looked: pool.length, how: 'names' }

  const shown = []
  const images = []
  for (const p of pool.slice(0, limit)) {
    try {
      images.push(await smallImage(await resolveImageSrc(client.id, p.path), 640))
      shown.push(p)
    } catch {
      // Not decodable here (a HEIC, a Drive file that would not render).
    }
  }
  if (shown.length < 2) return { pairs: [], looked: shown.length, how: 'none' }
  const trade = tradeOf(intake?.industry_trade || client.industry || '')
  const data = await sendChatMessage({
    clientId: client.id,
    system: FINDER_SYSTEM,
    message: finderPrompt(shown, TRADE_WORDS[trade] || 'home services'),
    images,
    transient: true,
  })
  const pairs = parsePairs(renderBlocks(data?.content || []), shown)
  return { pairs: await withUrls(pairs), looked: shown.length, how: 'looked' }
}
