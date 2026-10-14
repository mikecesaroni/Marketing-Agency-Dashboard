import { supabase } from './supabaseClient'
import { buildBrief } from './clientBrief'
import { fetchLearnings } from './adLearningsStore'
import { fetchLandingPages } from './landingPagesStore'
import { creativeSetToStudio, extractCreativeSets, fetchChatHistory, renderBlocks, sendChatMessage } from './clientChat'
import { listDriveImages } from './driveAssets'
import { assignLooks, makeAdsPrompt, pickBackground } from './adBatch'

/**
 * Three ads in one go: the network half.
 *
 * Asks the client's chat (the same brief, the same model, the same history,
 * so the ads land in the conversation too) for three creative sets, maps them
 * onto the Studio's slots, gives each a look and a starting photo. Nothing is
 * saved here; the Studio shows the three and saves on a click.
 */

/**
 * Writes `count` sets for the client. Resolves to the mapped sets, each with
 * `layout` and `backgroundPath` set. Throws with a plain reason when the chat
 * is not deployed, the key is missing, or no JSON came back.
 */
export async function makeAdBatch({ client, intake, ads = [], count = 3 }) {
  const [learnings, pages, history, files, drive] = await Promise.all([
    fetchLearnings(client.id).catch(() => []),
    fetchLandingPages(client.id).catch(() => []),
    fetchChatHistory(client.id),
    supabase
      .from('client_files')
      .select('file_name, storage_path, date_uploaded')
      .eq('client_id', client.id)
      .then(({ data }) => data || []),
    listDriveImages(client.id).catch(() => []),
  ])

  const system = buildBrief({ client, intake, ads, learnings, pages })
  const data = await sendChatMessage({
    clientId: client.id,
    chatId: history.chatId,
    system,
    message: makeAdsPrompt({ count, clientName: client.name }),
  })

  const text = renderBlocks(data?.content || [])
  const sets = (extractCreativeSets(text) || []).map(creativeSetToStudio)
  if (sets.length === 0) {
    throw new Error('The chat wrote no creative sets this time. Open the chat and ask it for three ads, or try again.')
  }
  const backgroundPath = pickBackground({ files, drive })
  return assignLooks(sets.slice(0, count)).map((s) => ({ ...s, backgroundPath: s.backgroundPath || backgroundPath }))
}
