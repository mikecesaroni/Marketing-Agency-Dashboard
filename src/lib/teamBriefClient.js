// The browser's side of the team brief: the team-digest function, the Slack
// connection, the email list and the log. See docs/weekly-status.md.

import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'

async function call(body) {
  const { data, error } = await supabase.functions.invoke('team-digest', { body })
  if (error) {
    const { status, detail } = await readFunctionError(error)
    if (!status || status === 404) throw new Error('The team-digest function is not deployed yet. Deploy it in Supabase.')
    throw new Error(detail || error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

/** Today's brief as it would go out: subject, text, html, the Slack message, the counts. */
export const previewBrief = ({ weekly } = {}) => call({ action: 'preview', ...(weekly === undefined ? {} : { weekly }) })

/** Send today's brief now, to Slack and to the email list, even if one already went. */
export const sendBrief = () => call({ action: 'brief', force: true })

/** Run the alert check now, quiet hours or not. */
export const runAlerts = ({ dryRun = false } = {}) => call({ action: 'alerts', force: true, dry_run: dryRun })

/** Whether Slack and email are set up, the email list, the schedule and the recent log. */
export const briefStatus = () => call({ action: 'status' })

/** Post a hello to the channel. */
export const testSlack = () => call({ action: 'test_slack' })

/**
 * Tell the channel a client was just added: name, package, price, who. The
 * function announces each client once, so a retry is harmless.
 */
export const announceClient = (clientId) => call({ action: 'client_added', client_id: clientId })

/**
 * Tell the channel an ad account was just connected to a client (Meta or
 * Google). Once per account; a retry is harmless. Best effort: callers
 * swallow a failure, the connection itself is already saved.
 */
export const announceAccount = (clientId, channel) => call({ action: 'account_connected', client_id: clientId, channel })

/**
 * From the client's own form page, the moment they submit: tell the channel.
 * By the link's token, since the client has no login. Once per submission;
 * the quarter-hour alert run catches any the page failed to send.
 */
export const announceForm = (token, form) => call({ action: 'form_submitted', token, form })

/**
 * A task ticked done on the Tasks page (or a client page): tell the channel
 * what and by whom. `by` is the "You" name the Tasks page keeps; the login's
 * profile name is the fallback. Once per completion.
 */
export const announceTaskDone = (taskId, by) => call({ action: 'task_done', task_id: taskId, by: by || '' })

/** Set, replace or clear the Slack incoming webhook. Admins only; the URL goes to the vault, never to a table the CRM reads. */
export async function setSlackWebhook(url) {
  const { data, error } = await supabase.rpc('set_slack_webhook', { url: String(url || '').trim() })
  if (error) throw new Error(error.message)
  return Boolean(data)
}

/** Whether a webhook is set. Never the URL. */
export async function slackConnected() {
  const { data, error } = await supabase.rpc('slack_connected')
  if (error) return false
  return Boolean(data)
}

export const BRIEF_EMAILS_KEY = 'team_brief_emails'

/** The addresses the brief is emailed to, as one comma-separated string. Empty means Slack only. */
export async function briefEmails() {
  const { data } = await supabase.from('app_settings').select('value').eq('key', BRIEF_EMAILS_KEY).maybeSingle()
  return String(data?.value || '')
}

export async function setBriefEmails(value) {
  const { error } = await supabase.from('app_settings').upsert({ key: BRIEF_EMAILS_KEY, value: String(value || '').trim() }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}
