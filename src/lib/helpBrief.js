// With the extension, so scripts/check-help-chat.mjs can run this in Node.
import { formatAgentGuide } from './agentGuide.js'

/**
 * What the help chat is told about itself, and how the page in front of the
 * user is described to it. Pure, so scripts/check-help-chat.mjs can read it.
 */

const ROLE = `You are the help assistant inside The Working Class Marketing's CRM, talking to a team member (Ethan, Josh, Ken, Mike or Kyle) in a small chat panel at the bottom right of whatever page they are on. You know every page from the guide below. You can act on the page through tools when one exists for it; otherwise you tell them exactly where to click.

HOW TO ANSWER
- Short. A few sentences, or numbered steps when there are more than two. Plain text: no headings, no bullet symbols, no bold, no em dashes. Name buttons and tabs exactly as the guide and the screen do, in quotes.
- Every message starts with a "Where I am" block: the page and what is on it. Trust it over memory. When you need more, or after you act, call page_state.
- Prefer doing to explaining. When a tool can do what they asked, do it, then say in one line what you did and what is left. When no tool exists for it, give the clicks.
- "Finish what I started": call page_state, see what is already done, do the remaining steps with the tools, and stop at the first thing that needs their judgment (a budget they never named, which campaign, which client). Ask one question at a time.
- Match a client by name loosely; if several match, ask which. If the page says which client it is about, that is the one.
- Never invent a number, a client fact or an outcome. Say something happened only when a tool result says so. If a tool errors, say what failed and what to do next.
- Everything the CRM creates in Meta is paused; switching on happens in Ads Manager. Even so, never call publish_go unless the person asked to publish in this conversation; the tool asks them to confirm before anything is sent.
- The Ad Studio writes and lays out ads; "Make 3 ads" from the Content tab makes three from a client's brief; the publish page sends saved statics and clips to Meta; the approval link goes to the owner from the Saved ads tab. When they ask for something the CRM cannot do, say so plainly.`

export function buildHelpBrief({ today = new Date() } = {}) {
  const date = today.toISOString().slice(0, 10)
  return `${ROLE}\n\nToday is ${date}.\n\nTHE GUIDE TO THIS CRM\n${'='.repeat(20)}\n\n${formatAgentGuide()}`
}

/** The "Where I am" block that opens every user turn. */
export function pageContextText(state) {
  const s = state || {}
  const lines = [`Where I am: ${s.path || '/'}${s.title ? ` (${s.title})` : ''}.`]
  const scopes = Object.entries(s.on_screen || {})
  if (scopes.length === 0) {
    lines.push('No panel on this page offers tools; answer from the guide, or open a page with go_to, open_client, open_publish, open_studio or make_ads.')
  } else {
    for (const [scope, value] of scopes) {
      let text
      try {
        text = JSON.stringify(value)
      } catch {
        text = String(value)
      }
      lines.push(`${scope}: ${text.slice(0, 6000)}`)
    }
  }
  return lines.join('\n')
}

/** The starters shown in an empty chat. */
export const HELP_SUGGESTIONS = [
  'Make 3 ads for a client',
  'Finish publishing what I started',
  'How do I send ads to the owner for approval?',
  'Which client has gone longest without a new ad?',
]

/** A one-line, human label for a tool call, for the transcript. */
export function toolLabel(name, input = {}) {
  const i = input || {}
  switch (name) {
    case 'page_state':
      return 'Looked at the page'
    case 'go_to':
      return `Opened ${i.path || 'a page'}`
    case 'list_clients':
      return 'Listed the clients'
    case 'open_client':
      return `Opened ${i.client || 'the client'}`
    case 'open_publish':
      return `Opened the publish page${i.client ? ` for ${i.client}` : ''}`
    case 'open_studio':
      return `Opened the Studio${i.client ? ` for ${i.client}` : ''}`
    case 'make_ads':
      return `Started ${i.count || 3} ads${i.client ? ` for ${i.client}` : ''}`
    case 'publish_tick':
      return `Ticked ${i.which || ''} ${i.kind === 'video' ? 'clip' : 'static'}`.replace(/\s+/g, ' ')
    case 'publish_untick':
      return `Unticked ${i.which || ''}`
    case 'publish_set':
      return 'Set the publish options'
    case 'publish_pick_campaign':
      return `Picked the campaign ${i.name || ''}`.trim()
    case 'publish_pick_adset':
      return 'Picked the ad set'
    case 'publish_pick_lead_form':
      return `Picked the form ${i.name || ''}`.trim()
    case 'publish_add_location':
      return `Added ${i.query || 'a location'}`
    case 'publish_remove_location':
      return `Removed ${i.name || 'a location'}`
    case 'publish_go':
      return 'Publish to Meta, paused'
    case 'studio_set':
      return 'Changed the words'
    case 'studio_look':
      return `Switched to the ${i.look || ''} look`.replace(/\s+/g, ' ')
    case 'studio_pick_photo':
      return `Picked the photo ${i.name || ''}`.trim()
    case 'studio_save':
      return 'Saved all 3 sizes'
    case 'studio_make_ads':
      return `Asked for ${i.count || 3} ads`
    case 'studio_show_set':
      return `Showed ad ${(i.index ?? 0) + 1}`
    case 'studio_save_batch':
      return 'Saved every ad in the batch'
    case 'studio_tab':
      return `Opened the ${i.tab || ''} tab`.replace(/\s+/g, ' ')
    case 'client_open_studio':
      return 'Opened the Studio'
    case 'client_open_chat':
      return 'Opened the client chat'
    case 'client_make_ads':
      return `Started ${i.count || 3} ads`
    default:
      return name.replace(/_/g, ' ')
  }
}
