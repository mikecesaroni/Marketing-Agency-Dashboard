// Weekly client reports.
//
// Runs every Monday morning, covers the Monday-to-Sunday week that just
// ended, and emails every client with ad spend that week: spend, leads,
// impressions, click rate and cost per lead, what each one means, and why
// the return on the leads is the number that matters. The copy lives in
// ./weekly.ts, which the app loads too, so the preview in the CRM
// and the email a client gets are the same code.
//
// Every report is also saved with a token, and the email links to the web
// copy (/report/<token>) where the client can tell us how many of the
// leads became jobs. That answer feeds the next week's report.
//
// Deployed with verify_jwt = true: the browser calls it with the anon key
// and pg_cron does the same, and both clear the gateway. Nothing here can be
// made to do harm by a stranger with the URL: one report per client per
// week, to the address on file, and only when there was spend.
//
// Secrets:
//   RESEND_API_KEY   needed to send email. Without it reports are still
//                    built every Monday and marked "ready", with the link
//                    to copy by hand.
//   REPORT_FROM      e.g. "The Working Class Marketing <reports@yourdomain.com>"
//   REPORT_REPLY_TO  optional, where client replies land
//   REPORT_BCC       optional, a copy of every report that goes out
//   REPORT_AGENCY_NAME  optional, the sign-off (default The Working Class Marketing)
//   APP_URL          optional, where the CRM lives, for the report link
//                    (default https://marketing-agency-dashboard.netlify.app)
//
// Body (all optional):
//   { dry_run: true }                build and report, send nothing, record nothing
//   { only_client_id }               one client
//   { week_start: "2026-09-29" }     a specific Monday instead of last week
//   { resend: true }                 send again even if this week's was sent
//   { action: "preview", client_id } the html, subject and text for one client

import {
  buildWeeklyModel,
  eligibility,
  previousWeek,
  renderWeeklyHtml,
  renderWeeklySubject,
  renderWeeklyText,
  reportWeek,
  weekFrom,
} from './weekly.ts'

type Result = {
  client: string
  client_id: string
  status: 'sent' | 'ready' | 'skipped' | 'failed'
  reason?: string
  recipient?: string
  leads?: number
  spend?: number
  token?: string
  url?: string
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }

  let body: { action?: string; client_id?: string; week_start?: string; dry_run?: boolean; only_client_id?: string; resend?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    // A cron ping with no body is the normal case.
  }

  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('REPORT_FROM')
  const canEmail = Boolean(apiKey && from)
  const agencyName = Deno.env.get('REPORT_AGENCY_NAME') || 'The Working Class Marketing'
  const appUrl = (Deno.env.get('APP_URL') || 'https://marketing-agency-dashboard.netlify.app').replace(/\/$/, '')
  const dryRun = Boolean(body.dry_run)
  const preview = body.action === 'preview'

  const week = body.week_start && /^\d{4}-\d{2}-\d{2}$/.test(body.week_start) ? weekFrom(body.week_start) : reportWeek()
  const prev = previousWeek(week)

  const get = async (path: string) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers })
    return res.ok ? await res.json() : []
  }

  try {
    const onlyId = preview ? String(body.client_id || '') : String(body.only_client_id || '')
    const clientFilter = onlyId ? `&id=eq.${encodeURIComponent(onlyId)}` : ''
    const rowFilter = onlyId ? `&client_id=eq.${encodeURIComponent(onlyId)}` : ''

    const [clients, intakes, metaRows, googleRows, existing, answers] = await Promise.all([
      get(`clients?archived=eq.false&select=id,name,archived,is_internal,report_email,weekly_report_enabled,meta_ad_account_id,google_ads_customer_id${clientFilter}`),
      get(`onboarding_intake?select=client_id,contact_email,average_job_value${rowFilter}`),
      get(`ad_daily?date=gte.${prev.from}&date=lte.${week.to}&select=client_id,ad_id,ad_name,date,spend,leads,impressions,clicks,effective_status${rowFilter}`),
      get(`google_campaign_daily?date=gte.${prev.from}&date=lte.${week.to}&select=client_id,campaign_id,campaign_name,date,cost,conversions,impressions,clicks${rowFilter}`),
      get(`weekly_reports?week_start=eq.${week.from}&select=client_id,status,token${rowFilter}`),
      // Last week's answer, so this week's report can show the return.
      get(`weekly_reports?week_start=eq.${prev.from}&select=client_id,jobs_booked,revenue,model${rowFilter}`),
    ])

    const intakeBy = new Map((intakes || []).map((i: any) => [i.client_id, i]))
    const existingBy = new Map((existing || []).map((r: any) => [r.client_id, r]))
    const answerBy = new Map((answers || []).map((r: any) => [r.client_id, r]))
    const by = (rows: any[]) => {
      const m = new Map<string, any[]>()
      for (const r of rows || []) {
        const list = m.get(r.client_id) || []
        list.push(r)
        m.set(r.client_id, list)
      }
      return m
    }
    const metaBy = by(metaRows)
    const googleBy = by(googleRows)

    const results: Result[] = []

    for (const client of clients || []) {
      const meta = (metaBy.get(client.id) || []) as any[]
      const google = (googleBy.get(client.id) || []) as any[]
      const inWeek = (r: any) => r.date >= week.from && r.date <= week.to
      const inPrev = (r: any) => r.date >= prev.from && r.date <= prev.to
      const intake = intakeBy.get(client.id)

      const check = eligibility({ client, intake, metaRows: meta.filter(inWeek), googleRows: google.filter(inWeek) })

      const last = answerBy.get(client.id)
      const lastAnswer = last ? { jobs_booked: last.jobs_booked, revenue: last.revenue, week: last.model?.week?.label || prev.label, spend: last.model?.totals?.spend || 0 } : null

      const model = buildWeeklyModel({
        client,
        intake,
        week,
        metaRows: meta.filter(inWeek),
        googleRows: google.filter(inWeek),
        prevMetaRows: meta.filter(inPrev),
        prevGoogleRows: google.filter(inPrev),
        lastAnswer,
      })

      if (preview) {
        const token = existingBy.get(client.id)?.token || ''
        const reportUrl = token ? `${appUrl}/report/${token}` : ''
        return json({
          client: client.name,
          week,
          eligible: check.ok,
          reason: check.ok ? null : check.reason,
          recipient: check.ok ? check.email : null,
          email_set_up: canEmail,
          subject: renderWeeklySubject(model),
          html: renderWeeklyHtml(model, { agencyName, reportUrl }),
          text: renderWeeklyText(model, { reportUrl }),
          model,
          url: reportUrl || null,
        })
      }

      if (!check.ok) {
        results.push({ client: client.name, client_id: client.id, status: 'skipped', reason: check.reason })
        if (!dryRun) await record(client.id, { status: 'skipped', reason: check.reason, model })
        continue
      }

      const was = existingBy.get(client.id)
      if (was?.status === 'sent' && !body.resend) {
        results.push({ client: client.name, client_id: client.id, status: 'skipped', reason: 'already sent for this week', token: was.token, url: `${appUrl}/report/${was.token}` })
        continue
      }

      const subject = renderWeeklySubject(model)

      if (dryRun) {
        results.push({ client: client.name, client_id: client.id, status: canEmail ? 'sent' : 'ready', reason: 'dry run, nothing sent', recipient: check.email, leads: model.totals.leads, spend: model.totals.spend })
        continue
      }

      // Save first, so the token exists for the link in the email.
      const saved = await record(client.id, { status: 'ready', reason: canEmail ? null : 'email not set up: add RESEND_API_KEY and REPORT_FROM in Supabase', recipient: check.email, subject, model })
      const token = saved?.token || was?.token || ''
      const reportUrl = token ? `${appUrl}/report/${token}` : ''
      const html = renderWeeklyHtml(model, { agencyName, reportUrl })
      await record(client.id, { html })

      if (!canEmail) {
        results.push({ client: client.name, client_id: client.id, status: 'ready', reason: 'email not set up: add RESEND_API_KEY and REPORT_FROM in Supabase', recipient: check.email, leads: model.totals.leads, spend: model.totals.spend, token, url: reportUrl })
        continue
      }

      try {
        const send = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: [check.email],
            subject,
            html,
            text: renderWeeklyText(model, { reportUrl }),
            ...(Deno.env.get('REPORT_REPLY_TO') ? { reply_to: Deno.env.get('REPORT_REPLY_TO') } : {}),
            ...(Deno.env.get('REPORT_BCC') ? { bcc: [Deno.env.get('REPORT_BCC')] } : {}),
          }),
        })
        const payload = await send.json()
        if (!send.ok) throw new Error(payload?.message || `Resend returned ${send.status}`)
        await record(client.id, { status: 'sent', reason: null, provider_id: payload?.id })
        results.push({ client: client.name, client_id: client.id, status: 'sent', recipient: check.email, leads: model.totals.leads, spend: model.totals.spend, token, url: reportUrl })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await record(client.id, { status: 'failed', reason: message })
        results.push({ client: client.name, client_id: client.id, status: 'failed', reason: message, recipient: check.email, token, url: reportUrl })
      }
    }

    if (preview) return json({ error: 'That client was not found.' }, 404)

    return json({
      week: week.label,
      week_start: week.from,
      dry_run: dryRun,
      email_set_up: canEmail,
      sent: results.filter((r) => r.status === 'sent').length,
      ready: results.filter((r) => r.status === 'ready').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results,
    })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }

  // One row per client per week. Upserted, so a skipped client fixed later
  // ends up with one row saying what finally happened. Returns the row, so
  // the caller can read the token.
  async function record(clientId: string, fields: Record<string, unknown>) {
    const res = await fetch(`${supabaseUrl}/rest/v1/weekly_reports?on_conflict=client_id,week_start`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ client_id: clientId, week_start: week.from, week_end: week.to, status: 'ready', updated_at: new Date().toISOString(), ...fields }),
    })
    if (!res.ok) return null
    const rows = await res.json().catch(() => [])
    return Array.isArray(rows) ? rows[0] : rows
  }
})
