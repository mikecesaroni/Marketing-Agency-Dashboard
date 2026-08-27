import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'

async function callFunction(body) {
  const { data, error } = await supabase.functions.invoke('ai-visibility', { body })

  if (error) {
    const { status, detail } = await readFunctionError(error)
    if (status === 404) {
      throw new Error(
        'The scan function is not deployed yet. Deploy ai-visibility in Supabase, then try again.'
      )
    }
    throw new Error(detail || 'The scan failed.')
  }
  if (data?.error) throw new Error(data.error)
  return data
}

/**
 * Runs a whole scan, reporting progress as it goes.
 *
 * A scan is fifteen live web searches, which is far more than one Edge
 * Function invocation can finish. So it is driven from here: start writes the
 * prompt set, run works through a batch at a time, finish scores it. That also
 * means a slow scan shows real progress instead of a spinner that might be
 * dead.
 */
export async function runScan({ businessName, websiteUrl, location, industry, clientId }, onProgress) {
  onProgress?.({ phase: 'building', done: 0, total: 0 })

  const started = await callFunction({
    action: 'start',
    business_name: businessName,
    website_url: websiteUrl,
    location,
    industry,
    client_id: clientId || null,
  })

  const scanId = started.scan_id
  const total = started.total || 0
  let done = 0

  onProgress?.({ phase: 'running', done, total, scanId })

  // Bounded rather than while(true): a batch that somehow stops making
  // progress should end the scan, not spin forever against a paid API.
  for (let round = 0; round < 20; round++) {
    const step = await callFunction({ action: 'run', scan_id: scanId })
    done = total - (step.remaining ?? 0)
    onProgress?.({ phase: 'running', done, total, scanId })
    if (!step.remaining) break
    if (!step.processed) break
  }

  onProgress?.({ phase: 'scoring', done: total, total, scanId })
  await callFunction({ action: 'finish', scan_id: scanId })

  return fetchScan(scanId)
}

export async function fetchScan(scanId) {
  const { data: scan, error } = await supabase
    .from('ai_scans')
    .select('*')
    .eq('id', scanId)
    .single()
  if (error) throw error

  const { data: prompts } = await supabase
    .from('ai_scan_prompts')
    .select('*')
    .eq('scan_id', scanId)
    .order('category')

  return { ...scan, prompts: prompts || [] }
}

export async function fetchScans(clientId) {
  let query = supabase
    .from('ai_scans')
    .select('id, business_name, website_url, domain, location, visibility_score, status, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  if (clientId) query = query.eq('client_id', clientId)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function deleteScan(scanId) {
  const { error } = await supabase.from('ai_scans').delete().eq('id', scanId)
  if (error) throw error
}

// Bands rather than a raw number alone: "31" means nothing on its own, and the
// whole point of the report is that somebody reads it and reacts.
export function scoreBand(score) {
  if (score === null || score === undefined) return { label: 'Not scored', tone: 'slate' }
  if (score >= 70) return { label: 'Strong', tone: 'green' }
  if (score >= 45) return { label: 'Patchy', tone: 'amber' }
  if (score >= 20) return { label: 'Weak', tone: 'orange' }
  return { label: 'Invisible', tone: 'red' }
}

export const TONE_CLASSES = {
  green: 'bg-green-50 border-green-200 text-green-900',
  amber: 'bg-amber-50 border-amber-200 text-amber-900',
  orange: 'bg-orange-50 border-orange-200 text-orange-900',
  red: 'bg-red-50 border-red-200 text-red-900',
  slate: 'bg-slate-50 border-slate-200 text-slate-900',
}

export const CATEGORY_LABELS = {
  unbranded: 'Who should I hire',
  solution: 'I have a problem',
  comparison: 'Comparing options',
}

/**
 * The findings a site audit produces on its own, before any prompt is run.
 *
 * Kept separate from the model's recommendations because these are facts
 * rather than judgement, and they are the ones that can be fixed this
 * afternoon. A blocked crawler is the single most common reason a business is
 * invisible, and it is a one-line change to a file.
 */
export function crawlerFindings(audit) {
  if (!audit) return []
  const found = []

  if (audit.blocks_everything) {
    found.push({
      severity: 'critical',
      title: 'The site tells every crawler to stay out',
      detail:
        'robots.txt has a blanket Disallow. No assistant can read this site, so no assistant can recommend it. Nothing else on this list matters until that changes.',
    })
  }

  if (audit.blocked_crawlers?.length > 0) {
    found.push({
      severity: 'critical',
      title: `Blocked from ${audit.blocked_crawlers.join(', ')}`,
      detail:
        'robots.txt specifically disallows these AI crawlers. They cannot read the site, so they answer from whatever third parties say instead.',
    })
  }

  if (audit.reachable === false) {
    found.push({
      severity: 'critical',
      title: 'The site did not respond',
      detail: 'Nothing could be fetched. Check the URL is right and the site is up.',
    })
  }

  if (audit.has_local_business === false) {
    found.push({
      severity: 'important',
      title: 'No LocalBusiness structured data',
      detail:
        'There is no machine-readable block giving the name, phone, address and service area. Assistants fall back to guessing from prose, or to whatever a directory says.',
    })
  }

  if (audit.has_faq === false) {
    found.push({
      severity: 'nice',
      title: 'No FAQ structured data',
      detail:
        'FAQ markup answers questions in the exact shape assistants quote. It is one of the cheapest ways to get pulled into an answer.',
    })
  }

  if (audit.llms_txt === false) {
    found.push({
      severity: 'nice',
      title: 'No llms.txt',
      detail:
        'An emerging convention: a plain-text file telling assistants what the business does and which pages matter. Not yet standard, so this is an edge rather than a gap.',
    })
  }

  if (!audit.meta_description) {
    found.push({
      severity: 'important',
      title: 'No meta description',
      detail: 'Often the one line quoted about a business. Leaving it empty leaves it to chance.',
    })
  }

  return found
}
