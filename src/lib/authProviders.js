/**
 * Which ways of signing in the Supabase project has switched on, from its
 * public settings endpoint (the anon key is enough). The login page shows
 * "Continue with Google" only when Google is on, so nobody meets a raw
 * "provider is not enabled" error from the callback. Asked once per page
 * load; any trouble reads as "off", which only hides the button.
 */
let cached = null

export async function enabledProviders() {
  if (cached) return cached
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  try {
    const res = await fetch(`${String(url || '').replace(/\/+$/, '')}/auth/v1/settings`, { headers: { apikey: key || '' } })
    const body = res.ok ? await res.json() : null
    cached = { google: Boolean(body?.external?.google) }
  } catch {
    cached = { google: false }
  }
  return cached
}
