// The team brief and the Slack alerts, server side.
//
// Two jobs, both from pg_cron (supabase/team-brief.sql), both runnable by
// hand from the Weekly status page:
//
//   brief    weekdays at 7am Eastern. Everything flagged on every client,
//            the clips waiting to publish, who is running clean with their
//            leads for the week, who is still onboarding. Mondays carry the
//            weekly status. To Slack when a webhook is set; by email when
//            RESEND_API_KEY and REPORT_FROM exist AND somebody listed
//            addresses in app_settings.team_brief_emails (opt in; Slack is
//            the channel). Once a day unless forced.
//   alerts   every quarter hour, 7am to 9pm Eastern. Only what is NEW: an
//            ad account disabled, ads gone quiet, a clip dropped in, ten
//            days without an ad; and a line when the ads are back. Each
//            thing once, tracked in team_alerts.
//
// The flags, the pipeline, the weekly status and the words are the CRM's
// own modules, bundled into model.js (`npm run brief`), so what lands in
// the channel is what the Client status board shows. Nothing here is
// written by a model: every line is the CRM's own sentence.
//
// Secrets: RESEND_API_KEY, REPORT_FROM (optional; email), REPORT_REPLY_TO,
// APP_URL, REPORT_AGENCY_NAME. The Slack webhook lives in the vault
// (public.slack_webhook()).
//
// Body: { action: 'brief' | 'alerts' | 'preview' | 'status' | 'test_slack',
//         force?, dry_run?, weekly?, weeks_back? }

import { createClient } from 'npm:@supabase/supabase-js@2'
// model.js is the bundle in this folder (`npm run brief`), served here from
// the public repo at a pinned commit through jsDelivr rather than uploaded
// alongside: the deploy tool takes files inline, and 47 KB of minified code
// does not survive being pasted. To ship a change: rebuild, commit, push,
// put the new commit id here, deploy index.ts.
import {
  alertKeys,
  alertsSlack,
  briefHtml,
  briefSlack,
  briefSubject,
  briefText,
  buildBrief,
  buildWeeklyStatus,
  diffAlerts,
  fetchStatusRows,
  fetchWeeklyRows,
  statusFromRows,
  weeklyText,
} from 'https://cdn.jsdelivr.net/gh/mikecesaroni/Marketing-Agency-Dashboard@0e2973d32ceb3ad6057fe2062c0f1a7aab5bedc4/supabase/functions/team-digest/model.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
}

// The team is on the East Coast: the day a brief is for, and the quiet
// hours, are theirs, whatever the server's clock says.
const ZONE = 'America/New_York'
function eastern(d = new Date()) {
  const day = d.toLocaleDateString('en-CA', { timeZone: ZONE })
  const hour = Number(d.toLocaleString('en-US', { timeZone: ZONE, hour: 'numeric', hour12: false }).replace(/\D/g, '')) % 24
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay()
  return { day, hour, dow }
}

const QUIET_FROM = 21
const QUIET_TO = 7

type Body = { action?: string; force?: boolean; dry_run?: boolean; weekly?: boolean; weeks_back?: number }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const apiKey = Deno.env.get('RESEND_API_KEY') || ''
  const from = Deno.env.get('REPORT_FROM') || ''
  const canEmail = Boolean(apiKey && from)
  const agencyName = Deno.env.get('REPORT_AGENCY_NAME') || 'The Working Class Marketing'
  const appUrl = (Deno.env.get('APP_URL') || 'https://marketing-agency-dashboard.netlify.app').replace(/\/$/, '')

  let body: Body = {}
  try {
    body = await req.json()
  } catch {
    // A cron ping with no body is a brief.
  }
  const action = body.action || 'brief'

  const slackUrl = async () => {
    const { data } = await supabase.rpc('slack_webhook')
    return typeof data === 'string' ? data : ''
  }
  const postSlack = async (url: string, message: { text: string; blocks?: unknown[] }) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message) })
    const text = await res.text()
    if (!res.ok) throw new Error(`Slack returned ${res.status}: ${text.slice(0, 200)}`)
  }
  const recipients = async () => {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'team_brief_emails').maybeSingle()
    return String(data?.value || '')
      .split(/[,\s;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
  }
  const sendEmail = async ({ to, subject, html, text }: { to: string[]; subject: string; html: string; text: string }) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html, text, ...(Deno.env.get('REPORT_REPLY_TO') ? { reply_to: Deno.env.get('REPORT_REPLY_TO') } : {}) }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload?.message || `Resend returned ${res.status}`)
    return payload?.id || ''
  }
  const record = (row: Record<string, unknown>) => supabase.from('team_digests').insert(row)

  try {
    const { day, hour, dow } = eastern()

    if (action === 'status') {
      const [{ data: last }, url, to] = await Promise.all([
        supabase.from('team_digests').select('day, kind, status, reason, slack_status, email_status, recipients, subject, created_at').order('created_at', { ascending: false }).limit(12),
        slackUrl(),
        recipients(),
      ])
      return json({
        day,
        slack: Boolean(url),
        email: canEmail,
        recipients: to,
        schedule: { brief: 'weekdays at 7am Eastern', alerts: 'every 15 minutes, 7am to 9pm Eastern, only when something is new' },
        log: last || [],
      })
    }

    if (action === 'test_slack') {
      const url = await slackUrl()
      if (!url) return json({ error: 'Slack is not connected yet. Paste the channel’s incoming webhook URL on the Weekly status page.' }, 400)
      await postSlack(url, {
        text: 'The CRM is connected to this channel.',
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `:white_check_mark: *The CRM is connected to this channel.*\nMorning briefs land here on weekdays at 7am Eastern. Alerts come the moment they appear (an ad account disabled, ads gone quiet, a new edit dropped in, ten days without an ad) and once when the ads are back. Nothing between 9pm and 7am.` } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: `<${appUrl}/weekly|Weekly status> · <${appUrl}/status|Client tiers>` }] },
        ],
      })
      await record({ day, kind: 'test', status: 'sent', slack_status: 'sent', subject: 'Connection test' })
      return json({ ok: true })
    }

    const statusRows = statusFromRows(await fetchStatusRows(supabase, { internalColumn: true, day }))

    if (action === 'alerts') {
      if (!body.force && (hour >= QUIET_FROM || hour < QUIET_TO)) return json({ day, skipped: 'quiet hours', hour })
      const current = alertKeys(statusRows)
      const { data: open } = await supabase.from('team_alerts').select('key, kind, label, client_id, client_name').is('cleared_at', null)
      const diff = diffAlerts(current, open || [])
      const message = alertsSlack(diff, { appUrl })
      if (body.dry_run) return json({ day, dry_run: true, fresh: diff.fresh, cleared: diff.cleared, message })

      const url = await slackUrl()
      let posted = false
      let error = ''
      if (message && url) {
        try {
          await postSlack(url, message)
          posted = true
        } catch (err) {
          error = err instanceof Error ? err.message : String(err)
        }
      }
      const now = new Date().toISOString()
      if (diff.fresh.length) {
        await supabase.from('team_alerts').upsert(
          diff.fresh.map((f) => ({ key: f.key, client_id: f.client.id, client_name: f.client.name, kind: f.kind, label: f.label, first_seen: now, last_seen: now, posted_at: posted ? now : null, cleared_at: null })),
          { onConflict: 'key' }
        )
      }
      if (diff.gone.length) await supabase.from('team_alerts').update({ cleared_at: now }).in('key', diff.gone.map((g) => g.key))
      if (message) {
        await record({
          day,
          kind: 'alerts',
          status: posted ? 'sent' : url ? 'failed' : 'ready',
          reason: posted ? null : url ? error : 'Slack is not connected',
          slack_status: posted ? 'sent' : url ? 'failed' : 'off',
          subject: message.text,
          model: { fresh: diff.fresh, cleared: diff.cleared },
        })
      }
      return json({ day, fresh: diff.fresh.length, cleared: diff.cleared.length, posted, error: error || undefined })
    }

    // brief and preview
    const wantWeekly = body.weekly ?? dow === 1
    const weekly = wantWeekly ? buildWeeklyStatus({ statusRows, ...(await fetchWeeklyRows(supabase, { day, weeksBack: body.weeks_back || 0 })) }) : null
    const model = buildBrief({ statusRows, weekly, day, appUrl })
    const subject = briefSubject(model)
    const text = briefText(model)
    const html = briefHtml(model, { agencyName })
    const slack = briefSlack(model)

    if (action === 'preview') {
      return json({ day, subject, text, html, slack, counts: model.counts, weekly: weekly ? { label: weekly.label, totals: weekly.totals, text: weeklyText(weekly, { appUrl }) } : null })
    }

    if (action !== 'brief') return json({ error: `Unknown action "${action}".` }, 400)

    if (!body.force) {
      const { data: already } = await supabase.from('team_digests').select('id').eq('day', day).eq('kind', 'brief').eq('status', 'sent').limit(1)
      if (already?.length) return json({ day, skipped: 'already sent today' })
      // Weekends: the Monday brief covers them. A forced send still goes.
      if (dow === 0 || dow === 6) return json({ day, skipped: 'weekend' })
    }

    const [url, to] = await Promise.all([slackUrl(), recipients()])
    let slackStatus = url ? 'ready' : 'off'
    let emailStatus = canEmail && to.length ? 'ready' : !to.length ? 'off' : 'not set up'
    const reasons: string[] = []
    if (body.dry_run) return json({ day, dry_run: true, subject, slack: slackStatus, email: emailStatus, recipients: to })

    if (url) {
      try {
        await postSlack(url, slack)
        slackStatus = 'sent'
      } catch (err) {
        slackStatus = 'failed'
        reasons.push(`Slack: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (canEmail && to.length) {
      try {
        await sendEmail({ to, subject, html, text })
        emailStatus = 'sent'
      } catch (err) {
        emailStatus = 'failed'
        reasons.push(`Email: ${err instanceof Error ? err.message : String(err)}`)
      }
    } else if (to.length && !canEmail) {
      reasons.push('Email: add RESEND_API_KEY and REPORT_FROM in Supabase to send the brief by email.')
    }

    // Everything the brief carried counts as posted, so the first alert run
    // of the day does not say it all again.
    const current = alertKeys(statusRows)
    if (current.length) {
      const now = new Date().toISOString()
      await supabase.from('team_alerts').upsert(
        current.map((f) => ({ key: f.key, client_id: f.client.id, client_name: f.client.name, kind: f.kind, label: f.label, first_seen: now, last_seen: now, posted_at: now, cleared_at: null })),
        { onConflict: 'key', ignoreDuplicates: true }
      )
    }

    const sent = slackStatus === 'sent' || emailStatus === 'sent'
    const failed = slackStatus === 'failed' || emailStatus === 'failed'
    const status = sent ? 'sent' : failed ? 'failed' : 'ready'
    await record({
      day,
      kind: 'brief',
      status,
      reason: reasons.join(' ') || (status === 'ready' ? 'Nowhere to send it yet: connect Slack on the Weekly status page.' : null),
      slack_status: slackStatus,
      email_status: emailStatus,
      recipients: to,
      subject,
      model: { counts: model.counts, weekly: weekly ? { label: weekly.label, totals: weekly.totals } : null },
    })
    return json({ day, subject, status, slack: slackStatus, email: emailStatus, recipients: to, reason: reasons.join(' ') || undefined })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
