// Rewrites one ad's copy, in the Ad Studio, without leaving it.
//
// The chat already writes whole creative sets, but once an ad is on the
// artboard the loop you actually want is small: this hook is flat, give me
// three sharper ones. Going back to the chat for that means a new set, a new
// handoff, and losing the photo and colours already chosen.
//
// So this returns OPTIONS rather than a rewritten ad. Every suggestion is one
// field and one value, the Studio renders them as chips, and nothing changes
// until a human clicks one. That keeps the model out of the position of
// silently editing an ad someone is in the middle of building.
//
// Secrets: ANTHROPIC_API_KEY, the same one client-chat uses.

import Anthropic from 'npm:@anthropic-ai/sdk'
import { z } from 'npm:zod'
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk/helpers/zod'

const MODEL = 'claude-opus-5'
const MAX_TOKENS = 16000

// The slots the Studio can actually paint or publish. Anything outside this
// list is dropped rather than trusted: the Studio applies what comes back
// straight into its own state, so the field name is the security boundary.
//
// No 'cta'. The image used to carry a painted button and no longer does --
// Meta renders the real one under the creative, so a second one inside it was
// a decoy nobody could click.
const FIELDS = [
  'badge',
  'hook',
  'offerAmount',
  'offerDetail',
  'subhead',
  'proof',
  'primaryText',
  'headline',
  'description',
] as const

const Suggestion = z.object({
  field: z.enum(FIELDS),
  value: z.string(),
  // One short reason, shown under the chip. Without it a wall of near-identical
  // options is a coin toss rather than a choice.
  why: z.string(),
})

const Reply = z.object({
  // One line on what was changed and why, above the chips.
  note: z.string(),
  options: z.array(Suggestion),
})

const SYSTEM = `You rewrite copy for a single home services ad that someone is
building right now in an ad studio. You are given every slot's current value
and an instruction about what to improve.

Return OPTIONS, never a finished ad. Each option is one field and one new value,
and a human clicks the ones they want. Give three options for a field they asked
about, so there is a real choice. Only touch other fields when the instruction
clearly covers them, or when leaving one alone would make the clicked option
read wrong.

There is NO BUTTON painted on the image. Meta renders the real call-to-action
button directly under the creative and it is chosen separately, so never write
copy that acts like a button or points at one inside the frame: no "click
here", no "tap this", no arrows aimed at nothing. If a line has to push toward
the button, it points DOWN and out of the image, and it belongs in primaryText.

What each slot is, and the limits that matter because they are painted into a
fixed layout:

- hook: the biggest text on the image. Five to eight words. This is the one line
  that has to stop a thumb.
- subhead: one line under the hook that finishes its thought. It must add a
  DIFFERENT fact than the hook, not restate it: a timeframe, a guarantee, a
  number. If the only honest version restates the hook, say so in the note and
  suggest cutting it.
- badge: the location pill, two to four words, rendered in caps.
- offerAmount: the number the eye lands on, and it keeps its symbol. "$500",
  "50% off", "Free".
- offerDetail: the rest of the offer, rendered in caps. Short.
- proof: one short line. A rating and a review count, or a real credential.
  Give the numbers as digits, the studio draws the star itself.
- primaryText: NOT on the image. It sits above the ad in the feed. Two or three
  short lines, and the first line is all that shows before "see more", so it
  carries the hook on its own.
- headline: NOT on the image either. It sits under the image in the feed, next
  to the button. Five to eight words, and it should not be word for word
  identical to the hook.
- description: NOT on the image. One short line under the headline.

Write like the business owner talks. Concrete over clever. No em dashes, no
square brackets, no placeholders. Never invent a number, a rating, a review
count, a licence or a guarantee that is not already somewhere in what you were
given. If an instruction needs a fact you do not have, say that in the note and
suggest what you can honestly write instead.`

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return json(
      {
        error:
          'ANTHROPIC_API_KEY is not set on this project. Add it under Project Settings > Edge Functions > Secrets.',
      },
      500
    )
  }

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  const instruction = String(body.instruction || '').trim()
  if (!instruction) return json({ error: 'Say what you want changed.' }, 400)

  const current = body.current && typeof body.current === 'object' ? body.current : {}
  const slots = FIELDS.map((f) => `${f}: ${String(current[f] ?? '').trim() || '(empty)'}`).join('\n')

  const about = [
    body.client_name ? `Business: ${body.client_name}` : '',
    body.industry ? `Trade: ${body.industry}` : '',
    body.market ? `Area served: ${body.market}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const client = new Anthropic({ apiKey })

    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      // Stable prefix first so it caches across every request from the panel,
      // then the ad, which changes on each one.
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      output_config: { format: zodOutputFormat(Reply, 'ad_copy_options') },
      messages: [
        {
          role: 'user',
          content: `${about ? `${about}\n\n` : ''}The ad as it stands:\n${slots}\n\nWhat I want: ${instruction}`,
        },
      ],
    })

    const parsed = response.parsed_output
    if (!parsed) {
      return json(
        { error: 'Claude replied but not in a shape the studio could read. Try asking again.' },
        502
      )
    }

    return json({
      note: parsed.note,
      // Belt and braces on the field name even though the schema constrains it:
      // this is what the Studio writes straight into its own state.
      options: parsed.options.filter((o) => (FIELDS as readonly string[]).includes(o.field)),
    })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: 'Rate limited by Anthropic. Give it a few seconds and try again.' }, 429)
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return json({ error: 'Anthropic rejected the API key on this project.' }, 401)
    }
    if (err instanceof Anthropic.APIError) {
      return json({ error: `Anthropic returned ${err.status}: ${err.message}` }, 502)
    }
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
