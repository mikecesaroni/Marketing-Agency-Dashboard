import { supabase } from './supabaseClient'
import { fetchAllRows } from './pagedQuery'
import { GHL_REQUIRED_KEYS, missingRequired } from './ghlSetupFields'
import { formatDate, getMonday, hasInternalColumn, today } from './queries'
import { nextSteps } from './nextSteps'

/**
 * Everything nextSteps() reads, for every active client, in eight queries.
 *
 * One round of queries rather than one per client: the dashboard and the
 * Deliverables board both want the whole roster, and fifteen clients times
 * eight tables would be a hundred requests on every page load.
 */
export async function fetchNextStepsForAll() {
  const monday = formatDate(getMonday(new Date()))
  const month = today().slice(0, 7)

  let clientsQuery = supabase.from('clients').select('*').eq('archived', false).order('name')
  if (await hasInternalColumn()) clientsQuery = clientsQuery.eq('is_internal', false)

  const [clientsRes, intakeRes, linksRes, ghlRes, deliverables, payRes, callsRes, filesRes, savedRes, pubRes, kpiRes, reportRes] =
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
        supabase.from('deliverables').select('id, client_id, title, status, template_key, phase, sort_order, due_date, assigned_to, notes').order('sort_order').order('id')
      ),
      supabase.from('client_payment_state').select('client_id, payment_type, status'),
      supabase.from('onboarding_call_steps').select('client_id, step_key'),
      supabase.from('client_files').select('client_id, storage_path'),
      supabase.from('saved_ads').select('client_id, stamp'),
      supabase.from('published_ads').select('client_id, ad_id'),
      supabase.from('weekly_kpis').select('client_id').eq('week_of', monday),
      supabase.from('report_sends').select('client_id, status').eq('month_key', month),
    ])

  if (clientsRes.error) throw clientsRes.error

  const by = (rows, pick = (r) => r.client_id) => {
    const m = new Map()
    for (const r of rows || []) {
      const k = pick(r)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(r)
    }
    return m
  }
  const intakeBy = new Map((intakeRes.data || []).map((r) => [r.client_id, r]))
  const linkBy = new Map()
  for (const l of linksRes.data || []) if (!linkBy.has(l.client_id)) linkBy.set(l.client_id, l)
  const ghlBy = new Map((ghlRes.data || []).map((r) => [r.client_id, r]))
  const dlBy = by(deliverables)
  const payBy = by(payRes.data)
  const callBy = by(callsRes.data)
  const filesBy = by((filesRes.data || []).filter((f) => /\.(png|jpe?g|webp|heic|heif)$/i.test(f.storage_path)))
  const savedBy = by(savedRes.data)
  const pubBy = by((pubRes.data || []).filter((p) => p.ad_id))
  const kpiBy = by(kpiRes.data)
  const reportBy = by((reportRes.data || []).filter((r) => r.status === 'sent'))

  const stamps = (rows) => new Set((rows || []).map((r) => r.stamp)).size

  return (clientsRes.data || []).map((client) => {
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
      counts: {
        photos: (filesBy.get(client.id) || []).length,
        savedAds: stamps(savedBy.get(client.id)),
        publishedAds: (pubBy.get(client.id) || []).length,
        kpisThisWeek: (kpiBy.get(client.id) || []).length,
        reportThisMonth: (reportBy.get(client.id) || []).length,
      },
      today: today(),
    }
    return { client, deliverables: ctx.deliverables, result: nextSteps(ctx) }
  })
}

/** The same, for one client page. */
export async function fetchNextStepsFor(clientId) {
  const all = await fetchNextStepsForAll()
  return all.find((r) => r.client.id === clientId) || null
}
