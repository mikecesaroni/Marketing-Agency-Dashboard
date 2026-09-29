import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'

/** Read the site now. Resolves to the saved fields for the client row. */
export async function readWebsite(clientId, url) {
  const { data, error } = await supabase.functions.invoke('read-website', {
    body: { client_id: clientId, ...(url ? { url } : {}) },
  })
  if (error) {
    const { status, detail } = await readFunctionError(error)
    if (!status) throw new Error('Could not reach the website reader. Is read-website deployed?')
    throw new Error(detail || `The website reader answered ${status}.`)
  }
  if (!data?.ok) throw new Error(data?.error || 'The website could not be read.')
  return {
    website_profile: data.profile,
    website_profile_at: new Date().toISOString(),
    website_profile_url: data.url,
    website_profile_pages: (data.pages || []).map((p) => p.url),
    website_profile_error: null,
  }
}
