// The weekly client report, app side. The maths, the sentences and the
// email are the shared module the Edge Function uses too, so the preview
// in the CRM is the email the client gets.
export {
  GLOSSARY,
  WHY_RETURN,
  buildWeeklyModel,
  eligibility,
  metrics,
  money,
  previousWeek,
  renderWeeklyHtml,
  renderWeeklySubject,
  renderWeeklyText,
  reportWeek,
  summarySentences,
  returnNote,
  validEmail,
  weekFrom,
  weekLabel,
} from '../../supabase/functions/weekly-report/weekly.ts'

import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'
import { publicLink } from './publicSite'

async function call(body) {
  const { data, error } = await supabase.functions.invoke('weekly-report', { body })
  if (error) {
    const { status, detail } = await readFunctionError(error)
    if (!status || status === 404) throw new Error('The weekly report function is not deployed yet. Deploy weekly-report in Supabase and try again.')
    throw new Error(detail || `The weekly report function returned ${status}.`)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

/** The log for one week: one row per client, with the client's name. */
export async function fetchWeeklyReports(weekStart) {
  const { data, error } = await supabase
    .from('weekly_reports')
    .select('id, client_id, week_start, week_end, token, status, reason, recipient, subject, jobs_booked, revenue, client_note, answered_at, updated_at, clients(name)')
    .eq('week_start', weekStart)
    .order('status')
  if (error) throw new Error(error.message)
  return data || []
}

/** The email as the client would get it, for one client. */
export async function previewWeeklyReport(clientId, weekStart) {
  return await call({ action: 'preview', client_id: clientId, week_start: weekStart })
}

/** Build (and send, when email is set up) this week's reports. */
export async function runWeeklyReports({ clientId, weekStart, dryRun = false, resend = false } = {}) {
  return await call({ only_client_id: clientId || undefined, week_start: weekStart, dry_run: dryRun, resend })
}

/** Where the report goes, and whether it goes at all. */
export async function setReportEmail(clientId, email) {
  const { error } = await supabase.from('clients').update({ report_email: email?.trim() || null }).eq('id', clientId)
  if (error) throw new Error(error.message)
}
export async function setWeeklyReportEnabled(clientId, enabled) {
  const { error } = await supabase.from('clients').update({ weekly_report_enabled: Boolean(enabled) }).eq('id', clientId)
  if (error) throw new Error(error.message)
}

/** The web copy, by token (the client's view). */
export async function loadWeeklyReport(token) {
  const { data, error } = await supabase.rpc('weekly_report_load', { p_token: token })
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? data[0] || null : data || null
}
export async function answerWeeklyReport(token, { jobs, revenue, note }) {
  const { data, error } = await supabase.rpc('weekly_report_answer', {
    p_token: token,
    p_jobs: jobs === '' || jobs == null ? null : Number(jobs),
    p_revenue: revenue === '' || revenue == null ? null : Number(revenue),
    p_note: note || null,
  })
  if (error) throw new Error(error.message)
  return Boolean(data)
}

/** The public link for a saved report. */
export const reportLink = (token) => publicLink(`/report/${token}`)
