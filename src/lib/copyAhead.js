import { supabase } from './supabaseClient'

/**
 * The words ahead of the click (2026-11-12: "when statics or videos are
 * dropped, the CRM already starts making the ad copies, so when I go to
 * click publish I don't have to wait"). The copy-ahead function writes the
 * three text options for every dropped static and clip not yet published,
 * every two minutes on its own (supabase/copy-ahead.sql). This is the nudge
 * from the drop boxes, so a drop's words are on their way within seconds
 * rather than within two minutes. Fire and forget: the schedule covers a
 * nudge that never arrived, and nothing here waits on it.
 */
export function writeCopyAhead(clientId) {
  return supabase.functions
    .invoke('copy-ahead', { body: { action: 'sweep', client_id: clientId || undefined } })
    .then(
      () => {},
      () => {}
    )
}
