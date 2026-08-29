import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'

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

// Screenshots attached to a turn, so reopening a chat shows what was actually
// asked about rather than a question with no picture.
export function imageUrls(content) {
  if (!Array.isArray(content)) return []
  return content
    .filter((b) => b?.type === 'image' && b.source?.type === 'url' && b.source.url)
    .map((b) => b.source.url)
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
  // Drop the template's own square brackets if the model echoed them. They can
  // wrap the whole value or just parts of it: "\u2605 [4.9] on Google" reached an
  // artboard with the brackets painted on, because only the wrapping case was
  // handled here.
  return found[1].replace(/\[([^\]]*)\]/g, '$1').trim()
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

// The model writes proof as a sentence ("5.0 stars on Google, 30 reviews").
// The strip on the artboard is one short line with the glyph, so pull the
// numbers out and rebuild it. Anything unrecognisable is passed through rather
// than mangled.
export function normaliseProof(text) {
  const raw = String(text || '').trim()
  if (!raw || raw.startsWith('\u2605')) return raw
  const rating = raw.match(/(\d(?:\.\d)?)\s*(?:stars?|\/\s*5)\b/i)
  if (!rating) return raw
  const count = raw.match(/([\d,]+)\+?\s*reviews?\b/i)
  const on = /google/i.test(raw) ? ' on Google' : ''
  return count
    ? `\u2605 ${rating[1]}${on} \u00b7 ${count[1]} reviews`
    : `\u2605 ${rating[1]}${on}`
}

// A set can come back as an owner-video script rather than a static ad. It has
// no artboard slots to fill, so the caller needs to know not to offer one.
function isVideoScript(brief) {
  return /video script|scene \d|hook \(\d/i.test(String(brief || ''))
}

// A bare number in offer_amount is dollars: the model writes "1200" where the
// artboard wants "$1,200". Only touched when the value is nothing but digits
// and separators — "50% off", "$0 Down" and "Free" all have to survive
// untouched, and guessing a currency onto them would be worse than leaving the
// number plain.
export function normaliseAmount(text) {
  const raw = String(text || '').trim()
  if (!/^\d[\d,]*(\.\d+)?$/.test(raw)) return raw
  const [whole, cents] = raw.replace(/,/g, '').split('.')
  return `$${Number(whole).toLocaleString('en-US')}${cents ? `.${cents}` : ''}`
}

// Only a real hex colour is worth overriding the studio's default with. The
// model occasionally writes a colour name, and handing that to a colour input
// silently resets it to black.
function hexColour(value) {
  const raw = String(value || '').trim()
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : ''
}

/**
 * Maps one creative set from the chat onto the slots the compositor paints.
 *
 * Two shapes arrive here and both have to work.
 *
 * The original one puts the layout in a `design_brief` block written to the
 * fixed labels clientBrief.js asks for, and this reads the slots back out by
 * label. The newer one names every slot as its own JSON key — location_badge,
 * offer_amount, cta_pill and the rest.
 *
 * The explicit keys win wherever both exist, because a named key cannot be
 * lost to a reworded label, and a label this cannot find is a slot that renders
 * empty. That failure was silent and total: with a set that carried only the
 * explicit keys, every briefLine call returned nothing, so the badge, offer,
 * subhead and proof strip all came through blank, the hook fell through to the
 * feed headline and the button fell through to the Meta enum.
 */
export function creativeSetToStudio(set) {
  if (!set) return null
  const brief = set.design_brief || ''
  const offer = splitOffer(briefLine(brief, 'OFFER BADGE'))

  // Explicit key first, brief second. Whitespace-only counts as absent, so a
  // key the model left as "" still falls through to the brief.
  const slot = (explicit, fromBrief) => String(explicit ?? '').trim() || fromBrief

  return {
    badge: slot(set.location_badge, briefLine(brief, 'LOCATION BADGE')),
    hook: slot(set.hook, briefLine(brief, 'HEADLINE ON IMAGE')) || set.headline || '',
    offerAmount: normaliseAmount(slot(set.offer_amount, offer.amount)),
    offerDetail: slot(set.offer_detail, offer.detail),
    subhead: slot(set.subhead, briefLine(brief, 'SUBHEAD')),
    proof: normaliseProof(slot(set.proof_strip, briefLine(brief, 'PROOF STRIP'))),
    // The button drawn on the image is whatever the set says; the enum is what
    // Meta needs on the ad object, and the two are rarely worded the same:
    // "Get My Quote" on the pill, GET_QUOTE on the ad.
    cta: slot(set.cta_pill, briefLine(brief, 'CTA BUTTON ON IMAGE')) || ctaLabel(set.cta),
    metaCta: ctaLabel(set.cta),
    // Empty rather than a default, so the Studio can tell "the set chose this
    // colour" from "the set said nothing" and leave its own default alone.
    accent: hexColour(set.offer_colour),
    badgeColor: hexColour(set.badge_colour),
    // Not a slot on the artboard: it describes the photo to go and find. Shown
    // in the banner because the picker above it is the next thing to fill in.
    backgroundNote: slot(set.background_note, briefLine(brief, 'BACKGROUND')),
    isVideo: isVideoScript(brief),
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

export async function sendChatMessage({ clientId, chatId, system, message, images }) {
  const { data, error } = await supabase.functions.invoke('client-chat', {
    body: {
      client_id: clientId,
      chat_id: chatId,
      system,
      message,
      // [{ url, media_type }] for any screenshots attached to this turn. Sent
      // as URLs so the stored history stays small enough to replay.
      images: images?.length ? images : undefined,
    },
  })

  if (error) {
    const { status, detail } = await readFunctionError(error)
    // A 404 here means the function was never deployed, which is a different
    // problem from the model refusing or the key being missing.
    if (status === 404 || /not found|404/i.test(detail)) {
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
