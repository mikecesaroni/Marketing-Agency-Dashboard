import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'

/**
 * Asks for alternative copy for the ad currently on the artboard.
 *
 * Returns options rather than a rewritten ad: every suggestion is one field and
 * one value, and nothing changes until somebody clicks it. The point is the
 * short loop, "this hook is flat, give me three sharper ones", without going
 * back to the chat and starting a whole new creative set, which would lose the
 * photo, the colours and everything else already chosen.
 */
export async function suggestCopy({ client, current, instruction }) {
  const { data, error } = await supabase.functions.invoke('ad-copy', {
    body: {
      client_name: client?.name,
      industry: client?.industry,
      market: client?.market,
      current,
      instruction,
    },
  })

  if (error) {
    const { status, detail } = await readFunctionError(error)
    // No status means nothing reached the browser at all, which is what an
    // undeployed function looks like from here.
    if (!status) {
      throw new Error(
        'Could not reach the copy assistant. It is probably not deployed yet — deploy ad-copy in Supabase and try again.'
      )
    }
    if (status === 404) {
      throw new Error('The copy assistant is not deployed yet. Deploy ad-copy in Supabase.')
    }
    throw new Error(detail || 'Could not get suggestions.')
  }

  if (data?.error) throw new Error(data.error)

  return { note: data?.note || '', options: data?.options || [] }
}

// What each slot is called on screen. The function answers with the state key,
// which is not what the field is labelled in the form.
export const FIELD_LABELS = {
  badge: 'Location badge',
  hook: 'Hook',
  offerAmount: 'Offer amount',
  offerDetail: 'Offer detail',
  subhead: 'Subhead',
  proof: 'Proof strip',
  cta: 'CTA pill',
  primaryText: 'Primary text',
  headline: 'Headline',
  description: 'Description',
}

// Suggestions arrive as a flat list and are far easier to choose between when
// all the hooks sit together. Insertion order is kept inside each group so the
// model's own ordering survives.
export function groupByField(options) {
  const groups = []
  for (const option of options || []) {
    const found = groups.find((g) => g.field === option.field)
    if (found) found.options.push(option)
    else groups.push({ field: option.field, options: [option] })
  }
  return groups
}
