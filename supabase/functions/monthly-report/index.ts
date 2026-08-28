// Monthly client reports.
//
// Runs on the 1st, covers the calendar month that just ended, and emails every
// client whose Meta campaigns are still running. Deployed with verify_jwt =
// true: the browser panel invokes it with the anon key, and pg_cron reaches it
// with a service-role Authorization header, so both callers already carry a
// key the gateway accepts. Leaving JWT verification off would make an
// unauthenticated endpoint that emails clients.
//
// Secrets:
//   RESEND_API_KEY   required
//   REPORT_FROM      required, e.g. "Round Table Management <reports@yourdomain.com>"
//   REPORT_REPLY_TO  optional, where client replies should land
//   REPORT_BCC       optional but recommended: a copy of every report that goes
//                    out, which is what makes unattended sending reviewable
//                    after the fact rather than invisible.

import {
  buildReportModel,
  eligibility,
  previousMonth,
  renderReportHtml,
  renderSubject,
  reportMonth,
} from '../_shared/report.ts'

type Result = {
  client: string
  status: 'sent' | 'skipped' | 'failed'
  reason?: string
  recipient?: string
  leads?: number
  spend?: number
}

// The browser sends Authorization and content-type on an invoke, which makes
// it a preflighted request. Without these headers the preflight has nothing to
// approve and the call never leaves the browser — surfacing as supabase-js's
// "Failed to send a request to the Edge Function", which reads like a network
// fault rather than a missing header.
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
  // Answered before the POST check below: the preflight is an OPTIONS request,
  // so rejecting it as "POST only" would block the very call it is clearing.
  if (req.method === 'OPTIONS') return json({}, 200)
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  let body: { month?: string; dry_run?: boolean; only_client_id?: string } = {}
  try {
    body = await req.json()
  } catch {
    // A cron ping with no body is the normal case.
  }

  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('REPORT_FROM')
  const dryRun = Boolean(body.dry_run)
  if (!dryRun && (!apiKey || !from)) {
    return json({ error: 'RESEND_API_KEY and REPORT_FROM must be set to send' }, 500)
  }

  // body.month ("2026-08") lets a specific month be re-run by hand; otherwise it
  // is the month that just ended. reportMonth() returns the month BEFORE the
  // date it is given, so asking for August means handing it a day in September.
  const month = (() => {
    if (!body.month) return reportMonth()
    const [y, m] = body.month.split('-').map(Number)
    if (!y || !m) return reportMonth()
    return reportMonth(new Date(y, m, 1))
  })()
  const prev = previousMonth(month)

  const get = async (path: string) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers })
    return res.ok ? await res.json() : []
  }

  const clients = await get('clients?archived=eq.false&select=*')
  const intakes = await get('onboarding_intake?select=client_id,contact_email,business_name')
  const rows = await get(
    `ad_daily?date=gte.${prev.from}&date=lte.${month.to}&select=client_id,ad_id,ad_name,date,spend,leads,effective_status`
  )
  const already = await get(
    `report_sends?month_key=eq.${month.key}&status=eq.sent&select=client_id`
  )

  const sentIds = new Set((already || []).map((r: { client_id: string }) => r.client_id))
  const intakeBy = new Map((intakes || []).map((i: { client_id: string }) => [i.client_id, i]))
  const rowsBy = new Map<string, unknown[]>()
  for (const r of rows || []) {
    const list = rowsBy.get(r.client_id) || []
    list.push(r)
    rowsBy.set(r.client_id, list)
  }

  const results: Result[] = []

  for (const client of clients || []) {
    if (body.only_client_id && client.id !== body.only_client_id) continue

    if (sentIds.has(client.id)) {
      results.push({ client: client.name, status: 'skipped', reason: 'already sent for this month' })
      continue
    }

    const all = (rowsBy.get(client.id) || []) as { date: string }[]
    const monthRows = all.filter((r) => r.date >= month.from && r.date <= month.to)
    const prevRows = all.filter((r) => r.date >= prev.from && r.date <= prev.to)

    const check = eligibility({ client, intake: intakeBy.get(client.id), rows: monthRows })
    if (!check.ok) {
      results.push({ client: client.name, status: 'skipped', reason: check.reason })
      if (!dryRun) await record(client.id, 'skipped', { reason: check.reason })
      continue
    }

    const model = buildReportModel({ client, month, rows: monthRows, prevRows })
    const html = renderReportHtml(model)
    const subject = renderSubject(model)

    if (dryRun) {
      results.push({
        client: client.name,
        status: 'sent',
        reason: 'dry run, nothing sent',
        recipient: check.email,
        leads: model.totals.leads,
        spend: model.totals.spend,
      })
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
          ...(Deno.env.get('REPORT_REPLY_TO') ? { reply_to: Deno.env.get('REPORT_REPLY_TO') } : {}),
          ...(Deno.env.get('REPORT_BCC') ? { bcc: [Deno.env.get('REPORT_BCC')] } : {}),
        }),
      })
      const payload = await send.json()

      if (!send.ok) throw new Error(payload?.message || `Resend returned ${send.status}`)

      await record(client.id, 'sent', {
        recipient: check.email,
        subject,
        provider_id: payload?.id,
        html,
      })
      results.push({
        client: client.name,
        status: 'sent',
        recipient: check.email,
        leads: model.totals.leads,
        spend: model.totals.spend,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await record(client.id, 'failed', { recipient: check.email, subject, reason: message })
      results.push({ client: client.name, status: 'failed', reason: message })
    }
  }

  return json({
    month: month.label,
    month_key: month.key,
    dry_run: dryRun,
    sent: results.filter((r) => r.status === 'sent').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  })

  // Upsert rather than insert: a client skipped in an earlier run and fixed
  // since should end up with one row describing what finally happened, not a
  // pile of historical rejections.
  async function record(clientId: string, status: string, extra: Record<string, unknown>) {
    await fetch(`${supabaseUrl}/rest/v1/report_sends?on_conflict=client_id,month_key`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ client_id: clientId, month_key: month.key, status, ...extra }),
    })
  }
})
