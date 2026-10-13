import { supabase } from './supabaseClient'

/**
 * AI ad concepts: batches of finished ads made by Higgsfield from the
 * Studio's brief, kept in ad_concepts with their images in the bucket under
 * concepts/<client>/. The Studio shows them as a gallery and uses a pick as
 * the "AI concept" look. Network only; nothing here decides anything.
 */

export function conceptUrl(path) {
  return supabase.storage.from('client-files').getPublicUrl(path).data.publicUrl
}

async function call(body) {
  const { data, error } = await supabase.functions.invoke('ad-concepts', { body })
  if (error) {
    let parsed = null
    try {
      parsed = await error.context?.json()
    } catch {
      /* not JSON */
    }
    const status = error.context?.status
    const detail = parsed?.error || error.message || ''
    if (status === 404 || /not found|404/i.test(detail)) {
      throw new Error('The ad-concepts function is not deployed yet. Deploy supabase/functions/ad-concepts and try again.')
    }
    const err = new Error(detail || 'The concepts request failed.')
    err.notConfigured = Boolean(parsed?.not_configured)
    throw err
  }
  if (data?.error) {
    const err = new Error(data.error)
    err.notConfigured = Boolean(data.not_configured)
    throw err
  }
  return data || {}
}

export async function fetchConcepts(clientId) {
  const { data, error } = await supabase
    .from('ad_concepts')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(12)
  if (error) throw error
  return data || []
}

/** Submits a batch. `refPaths` are client-files paths (the logo first when hasLogo). */
export const createConcepts = ({ clientId, brief, refPaths, hasLogo, aspect = '4:5', batch = 4 }) =>
  call({ action: 'create', client_id: clientId, brief, ref_paths: refPaths, has_logo: hasLogo, aspect, batch }).then((d) => d.concept)

/** Asks the function to check on a working batch and returns the row. */
export const refreshConcept = (id) => call({ action: 'status', id }).then((d) => d.concept)

export async function deleteConcept(concept) {
  const paths = Array.isArray(concept?.paths) ? concept.paths : []
  if (paths.length > 0) await supabase.storage.from('client-files').remove(paths)
  const { error } = await supabase.from('ad_concepts').delete().eq('id', concept.id)
  if (error) throw error
}
