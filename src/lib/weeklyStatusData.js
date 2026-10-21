import { supabase } from './supabaseClient'
import { hasInternalColumn } from './queries'
import { fetchStatusRows, statusFromRows } from './statusRows'
import { fetchWeeklyRows } from './weeklyRows'
import { buildWeeklyStatus } from './weeklyStatus'

/** The weekly executive status for the whole book. weeksBack 0 is the last complete week. */
export async function fetchWeeklyStatus({ weeksBack = 0 } = {}) {
  const internalColumn = await hasInternalColumn()
  const [statusRaw, weekly] = await Promise.all([fetchStatusRows(supabase, { internalColumn }), fetchWeeklyRows(supabase, { weeksBack })])
  return buildWeeklyStatus({ statusRows: statusFromRows(statusRaw), ...weekly })
}
