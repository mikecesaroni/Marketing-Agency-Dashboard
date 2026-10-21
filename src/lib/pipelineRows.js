// Everything nextSteps() reads, for every active client, in one round of
// queries, and the pure step that turns those rows into the pipeline.
//
// Split in two on purpose. fetchPipelineRows takes the Supabase client as an
// argument rather than importing the browser's, so the same fourteen queries
// run from the app (nextStepsData.js) and from the team-digest Edge Function
// (with the service key). pipelineFromRows is pure, so the brief that lands
// in the inbox and the board on the screen cannot disagree about where a
// client stands.
//
// One round of queries rather than one per client: the dashboard, the
// status board and the brief all want the whole roster, and fifteen clients
// times fourteen tables would be two hundred requests.

import { fetchAllRows } from './pagedQuery.js'
import { GHL_REQUIRED_KEYS, missingRequired } from './ghlSetupFields.js'
import { addDays, formatDate, getMonday, today } from './dates.js'
import { nextSteps } from './nextSteps.js'

/**
 * The raw rows. `internalColumn` false skips the is_internal filter for a
 * project that has not applied supabase/internal-businesses.sql yet.
 */
export async function fetchPipelineRows(supabase, { internalColumn = true, day = today() } = {}) {
  const monday = formatDate(getMonday(new Date(`${day}T12:00:00`)))
  const month = day.slice(0, 7)

  let clientsQuery = supabase.from('clients').select('*').eq('archived', false).order('name')
  if (internalColumn) clientsQuery = clientsQuery.eq('is_internal', false)

  const [clientsRes, intakeRes, linksRes, ghlRes, deliverables, payRes, callsRes, filesRes, savedRes, pubRes, kpiRes, reportRes, overridesRes, googleRows] =
    await Promise.all([
      clientsQuery,
      supabase.from('onboarding_intake').select('*'),
      supabase
        .from('onboarding_links')
        .select('client_id, created_at, intake_submitted_at, ghl_submitted_at')
        .eq('revoked', false)
        .order('created_at', { ascending: false }),
      supabase.from('ghl_setup').select(`client_id, ${GHL_REQUIRED_KEYS.join(', ')}`),
      fetchAllRows(() =>
        supabase
          .from('deliverables')
          .select('id, client_id, title, type, status, priority, source, template_key, phase, sort_order, due_date, completed_date, assigned_to, notes, updated_at')
          .order('sort_order')
          .order('id')
      ),
      supabase.from('client_payment_state').select('client_id, payment_type, status'),
      supabase.from('onboarding_call_steps').select('client_id, step_key'),
      supabase.from('client_files').select('client_id, storage_path'),
      supabase.from('saved_ads').select('client_id, stamp'),
      supabase.from('published_ads').select('client_id, ad_id'),
      supabase.from('weekly_kpis').select('client_id').eq('week_of', monday),
      supabase.from('report_sends').select('client_id, status').eq('month_key', month),
      supabase.from('step_overrides').select('client_id, step_key, done_at, done_by, note'),
      // Active Google campaigns that showed ads in the last 30 days, for the
      // "Google Ads campaign published" step. Missing table reads as none.
      fetchAllRows(() =>
        supabase
          .from('google_campaign_daily')
          .select('id, client_id, campaign_id')
          .eq('campaign_status', 'ENABLED')
          .gt('impressions', 0)
          .gte('date', addDays(day, -29))
          .order('id')
      ).catch(() => []),
    ])

  if (clientsRes.error) throw clientsRes.error

  return {
    day,
    clients: clientsRes.data || [],
    intakes: intakeRes.data || [],
    links: linksRes.data || [],
    ghl: ghlRes.data || [],
    deliverables: deliverables || [],
    payments: payRes.data || [],
    callSteps: callsRes.data || [],
    files: filesRes.data || [],
    saved: savedRes.data || [],
    published: pubRes.data || [],
    kpis: kpiRes.data || [],
    reports: reportRes.data || [],
    overrides: overridesRes.data || [],
    googleRows: googleRows || [],
  }
}

/** The pipeline for every client: [{ client, intake, deliverables, result }]. Pure. */
export function pipelineFromRows(raw) {
  const day = raw.day || today()
  const by = (rows, pick = (r) => r.client_id) => {
    const m = new Map()
    for (const r of rows || []) {
      const k = pick(r)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(r)
    }
    return m
  }
  const intakeBy = new Map((raw.intakes || []).map((r) => [r.client_id, r]))
  const linkBy = new Map()
  for (const l of raw.links || []) if (!linkBy.has(l.client_id)) linkBy.set(l.client_id, l)
  const ghlBy = new Map((raw.ghl || []).map((r) => [r.client_id, r]))
  const dlBy = by(raw.deliverables)
  const payBy = by(raw.payments)
  const callBy = by(raw.callSteps)
  const filesBy = by((raw.files || []).filter((f) => /\.(png|jpe?g|webp|heic|heif)$/i.test(f.storage_path)))
  const savedBy = by(raw.saved)
  const pubBy = by((raw.published || []).filter((p) => p.ad_id))
  const kpiBy = by(raw.kpis)
  const reportBy = by((raw.reports || []).filter((r) => r.status === 'sent'))
  const overBy = by(raw.overrides)
  const googleBy = new Map()
  for (const r of raw.googleRows || []) {
    if (!googleBy.has(r.client_id)) googleBy.set(r.client_id, new Set())
    googleBy.get(r.client_id).add(r.campaign_id)
  }

  const stamps = (rows) => new Set((rows || []).map((r) => r.stamp)).size

  return (raw.clients || []).map((client) => {
    const ghl = ghlBy.get(client.id) || null
    const ctx = {
      client,
      intake: intakeBy.get(client.id) || null,
      link: linkBy.get(client.id) || null,
      ghl,
      ghlMissing: ghl ? missingRequired(ghl) : undefined,
      deliverables: dlBy.get(client.id) || [],
      payments: payBy.get(client.id) || [],
      callSteps: callBy.get(client.id) || [],
      overrides: overBy.get(client.id) || [],
      counts: {
        photos: (filesBy.get(client.id) || []).length,
        savedAds: stamps(savedBy.get(client.id)),
        publishedAds: (pubBy.get(client.id) || []).length,
        kpisThisWeek: (kpiBy.get(client.id) || []).length,
        reportThisMonth: (reportBy.get(client.id) || []).length,
        googleCampaigns: googleBy.get(client.id)?.size || 0,
      },
      today: day,
    }
    return { client, intake: ctx.intake, deliverables: ctx.deliverables, result: nextSteps(ctx) }
  })
}
