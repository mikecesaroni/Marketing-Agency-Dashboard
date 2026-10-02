import { supabase } from './supabaseClient'
import { normalizeUrl } from './landingPages'

// Reads and writes for landing_pages. The arithmetic is in landingPages.js.

const COLS = 'id,client_id,url,label,purpose,notes,added_by,created_at,updated_at'

/** Every page for one client, oldest first (the page sorts by purpose). */
export async function fetchLandingPages(clientId) {
  const { data, error } = await supabase.from('landing_pages').select(COLS).eq('client_id', clientId).order('created_at')
  if (error) throw new Error(error.message)
  return data || []
}

/** Every page for every client, for the Content tab's door. */
export async function fetchAllLandingPages() {
  const { data, error } = await supabase.from('landing_pages').select(COLS).order('created_at')
  if (error) throw new Error(error.message)
  return data || []
}

/** Saves a page. Throws in plain words when the address is not one. */
export async function addLandingPage(clientId, { url, label = '', purpose = 'other', notes = '', addedBy = null }) {
  const clean = normalizeUrl(url)
  if (!clean) throw new Error('That does not look like a web address. Paste the full link, like https://workingclassgroup.com/your-page.')
  const { data, error } = await supabase
    .from('landing_pages')
    .insert({ client_id: clientId, url: clean, label: label.trim(), purpose, notes: notes.trim(), added_by: addedBy })
    .select(COLS)
    .single()
  if (error) throw new Error(error.message)
  return data
}

/** Changes label, purpose, notes or the address. */
export async function updateLandingPage(id, patch) {
  const next = { ...patch, updated_at: new Date().toISOString() }
  if ('url' in next) {
    const clean = normalizeUrl(next.url)
    if (!clean) throw new Error('That does not look like a web address.')
    next.url = clean
  }
  const { data, error } = await supabase.from('landing_pages').update(next).eq('id', id).select(COLS).single()
  if (error) throw new Error(error.message)
  return data
}

/** Forgets a page. The page itself (in GoHighLevel or wherever it lives) is untouched. */
export async function removeLandingPage(id) {
  const { error } = await supabase.from('landing_pages').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
