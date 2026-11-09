// Where a state's county shapes come from, for the County map template.
//
// One JSON per state at stock/geo/<ABBR>.json in the client-files bucket,
// built once from the US Atlas by the geo-shapes function: the bucket copy
// first (a plain public fetch, no function to wake), the function when the
// state has not been built yet (it builds, stores and answers). Cached for
// the life of the page: the Studio asks on every repaint.

import { supabase } from './supabaseClient'
import { publicUrl } from './savedAds'
import { STATE_FIPS } from './countyMap.js'

const cache = new Map()

/** The path a state's shapes live at in the bucket. */
export const stateShapesPath = (abbr) => `stock/geo/${String(abbr || '').toUpperCase()}.json`

async function fetchStateShapes(abbr) {
  const res = await fetch(publicUrl(stateShapesPath(abbr))).catch(() => null)
  if (res?.ok) return res.json()
  const { data, error } = await supabase.functions.invoke('geo-shapes', { body: { state: abbr } })
  if (error) throw new Error('Could not load the county map. Deploy geo-shapes in Supabase if it is missing.')
  if (data?.error) throw new Error(data.error)
  return data
}

/**
 * A state's counties, {state, counties: [{id, name, rings}]}, or null for
 * anything that is not a state. The promise is cached so every caller on
 * the page shares one load; a failure is forgotten so a retry can work.
 */
export function loadStateShapes(abbr) {
  const state = String(abbr || '').toUpperCase()
  if (!STATE_FIPS[state]) return Promise.resolve(null)
  if (!cache.has(state)) {
    cache.set(
      state,
      fetchStateShapes(state).catch((err) => {
        cache.delete(state)
        throw err
      })
    )
  }
  return cache.get(state)
}
