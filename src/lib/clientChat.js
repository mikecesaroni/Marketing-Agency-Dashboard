import { supabase } from './supabaseClient'

// Flattens Anthropic content blocks to what the chat bubble should show.
// Thinking blocks are dropped and tool calls are summarised rather than dumped:
// a wall of JSON in the transcript buries the actual answer.
export function renderBlocks(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((b) => {
      if (b.type === 'text') return b.text
      if (b.type === 'tool_use' || b.type === 'mcp_tool_use') {
        return `→ used ${b.name || 'a tool'}`
      }
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
}

// Pulls the creative_sets JSON the brief asks for out of a reply, so the copy
// can be read structurally later instead of re-keyed. Returns null when the
// reply has no JSON block, which is the normal case for ordinary chat turns.
export function extractCreativeSets(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1])
    return Array.isArray(parsed?.creative_sets) ? parsed.creative_sets : null
  } catch {
    // A malformed block is worth ignoring rather than throwing — the prose
    // copy above it is still perfectly usable.
    return null
  }
}

// Meta sends CTAs as enums; the button on the artboard should read like a button.
const CTA_LABELS = {
  CALL_NOW: 'Call Now',
  GET_QUOTE: 'Get Quote',
  BOOK_NOW: 'Book Now',
  LEARN_MORE: 'Learn More',
  SIGN_UP: 'Sign Up',
  SEND_MESSAGE: 'Send Message',
  MESSAGE_PAGE: 'Send Message',
  GET_OFFER: 'Get Offer',
}

export function ctaLabel(value) {
  const raw = String(value || '').trim()
  if (!raw) return 'Get Quote'
  const key = raw.toUpperCase().replace(/[\s-]+/g, '_')
  if (CTA_LABELS[key]) return CTA_LABELS[key]
  // Already human ("Get Quote") or something unexpected: title-case it rather
  // than shouting GET_QUOTE across the button.
  return raw
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// The design brief is written to a fixed set of labels (see clientBrief.js), so
// the on-image lines can be read back out of it.
function briefLine(designBrief, label) {
  // Horizontal whitespace only. Plain \s would eat the newline and let an
  // empty "OFFER BADGE:" line capture whatever sits on the line below it.
  const h = '[^\\S\\n]*'
  const re = new RegExp(`^${h}${label}${h}:${h}(\\S.*)$`, 'im')
  const found = String(designBrief || '').match(re)
  if (!found) return ''
  // Drop the template's own square brackets if the model echoed them.
  return found[1].trim().replace(/^\[(.*)\]$/, '$1').trim()
}

// "$29.95 15-Point Visual Inspection" -> amount + detail. The leading price or
// percentage is the thing the eye lands on, so it gets its own line in the
// offer block.
export function splitOffer(text) {
  const raw = String(text || '').trim()
  // The qualifier is part of the number: "$0 Down" and "$500 Off" both read
  // wrong when the word is stranded on the detail line.
  const m = raw.match(/^(\$[\d,.]+(?:\s*(?:off|down))?|\d+%\s*(?:off|down)|free)\b[\s\u2013\u2014:-]*(.*)$/i)
  if (m && m[2]) return { amount: m[1].trim(), detail: m[2].trim() }
  return { amount: '', detail: raw }
}

/**
 * Maps one creative set from the chat onto the slots the compositor paints.
 *
 * The JSON carries the copy; the design brief carries the layout, written to
 * the fixed labels clientBrief.js asks for. Reading them back out is what lets
 * the model fill the whole artboard rather than just the headline.
 */
export function creativeSetToStudio(set) {
  if (!set) return null
  const brief = set.design_brief || ''
  const offer = splitOffer(briefLine(brief, 'OFFER BADGE'))
  return {
    badge: briefLine(brief, 'LOCATION BADGE'),
    hook: briefLine(brief, 'HEADLINE ON IMAGE') || set.headline || '',
    offerAmount: offer.amount,
    offerDetail: offer.detail,
    subhead: briefLine(brief, 'SUBHEAD'),
    proof: briefLine(brief, 'PROOF STRIP') || set.description || '',
    cta: ctaLabel(set.cta),
    // Carried through for reference, not painted: the primary text is the ad
    // copy that sits above the image in the feed.
    hookAngle: set.hook_angle || '',
    primaryText: set.primary_text || '',
    headline: set.headline || '',
    description: set.description || '',
    designBrief: brief,
  }
}

export async function fetchChatHistory(clientId) {
  const { data: chats } = await supabase
    .from('client_chats')
    .select('id')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
    .limit(1)

  const chatId = chats?.[0]?.id
  if (!chatId) return { chatId: null, messages: [] }

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return { chatId, messages: data || [] }
}

export async function sendChatMessage({ clientId, chatId, system, message }) {
  const { data, error } = await supabase.functions.invoke('client-chat', {
    body: { client_id: clientId, chat_id: chatId, system, message },
  })

  if (error) {
    // A 404 here means the function was never deployed, which is a different
    // problem from the model refusing or the key being missing.
    const detail = data?.error || error.message || ''
    if (/not found|404/i.test(detail)) {
      throw new Error(
        'The client-chat function is not deployed yet. Deploy supabase/functions/client-chat.'
      )
    }
    throw new Error(detail || 'Chat request failed')
  }

  if (data?.error) throw new Error(data.error)
  return data
}

export async function clearChat(clientId) {
  const { data: chats } = await supabase
    .from('client_chats')
    .select('id')
    .eq('client_id', clientId)

  for (const c of chats || []) {
    await supabase.from('client_chats').delete().eq('id', c.id)
  }
}
