import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Copy .env.example to .env and fill in your project URL and anon key.'
  )
}

// The session is kept in the browser and refreshed on its own, so a sign-in
// survives a refresh, a closed tab and a new day on the same device; only
// "Sign out" ends it. These are the client's defaults, written out so nobody
// wonders where the remembering happens.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
