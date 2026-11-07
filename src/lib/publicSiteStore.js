// The address client links go out on, kept in app_settings and read into
// src/lib/publicSite.js (which has no imports of its own, so the network
// half lives here). "Can we change the URL of this CRM when we send out
// links" (2026-11-07): the links the CRM hands to clients (dashboard,
// weekly report, approval, onboarding form, scripts, videos) carry this
// address instead of the CRM's own once it is saved. The weekly-report
// function reads the same row for the links in its emails.

import { supabase } from './supabaseClient'
import { PUBLIC_APP_URL_KEY, cleanPublicUrl, setPublicAppUrl } from './publicSite'

/** Reads the saved address into publicSite's cache. '' when none is saved. */
export async function loadPublicAppUrl() {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', PUBLIC_APP_URL_KEY).maybeSingle()
  if (error) throw error
  return setPublicAppUrl(data?.value || '')
}

/**
 * Saves the address (cleaned: https://, the host, nothing else) and makes
 * every link built from now on use it. An empty value clears it, and links
 * go back to the CRM's own address.
 */
export async function savePublicAppUrl(value) {
  const clean = cleanPublicUrl(value)
  if (String(value || '').trim() && !clean) throw new Error('That is not a web address. Something like clients.yourdomain.com.')
  const { error } = await supabase.from('app_settings').upsert({ key: PUBLIC_APP_URL_KEY, value: clean }, { onConflict: 'key' })
  if (error) throw error
  return setPublicAppUrl(clean)
}
