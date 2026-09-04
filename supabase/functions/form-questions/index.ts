// Recommends the questions for a client's Meta instant form.
//
// The form is the whole job of a lead ad: what it asks decides whether a lead
// is callable and whether it is worth calling. Too few questions and every
// lead is a name and a shrug; too many and nobody finishes. Meta's own data
// and every account here agree that prefilled fields are nearly free and typed
// answers are expensive, so the recommendation is mostly about which ONE or
// TWO typed questions earn their place.
//
// Everything it needs is already in the CRM and is read here rather than
// passed in: the onboarding form (including "What do you need to know from a
// lead?", which the client answered themselves) and the latest chat, where the
// offer and the angle usually get worked out. Sending the transcript up from
// the browser would be slower, larger and would let a caller claim to be a
// client they are not.
//
// Secrets: ANTHROPIC_API_KEY.

import Anthropic from 'npm:@anthropic-ai/sdk'
import { z } from 'npm:zod'
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk/helpers/zod'

const MODEL = 'claude-opus-5'
const MAX_TOKENS = 8000

// Exactly the types meta-publish's buildQuestions will accept. Anything else
// is silently dropped there, so a recommendation outside this list would look
// like it worked and then not be on the form.
const STANDARD = [
  'FULL_NAME',
  'FIRST_NAME',
  'LAST_NAME',
  'EMAIL',
  'PHONE',
  'STREET_ADDRESS',
  'CITY',
  'STATE',
  'ZIP',
  'POST_CODE',
  'COUNTRY',
  'COMPANY_NAME',
  'JOB_TITLE',
] as const

const Question = z.object({
  // CUSTOM is the only one that carries a label; the rest are Meta's own
  // prefilled fields.
  type: z.enum([...STANDARD, 'CUSTOM']),
  label: z.string(),
  why: z.string(),
})

const Reply = z.object({
  form_name: z.string(),
  questions: z.array(Question),
  thank_you: z.string(),
  note: z.string(),
})

const SYSTEM = `You choose the questions on a Meta instant form for a home
services business -- HVAC, plumbing, appliance repair and the like. The form is
attached to a lead ad; somebody taps the ad, the form opens inside Facebook or
Instagram, and most of it is already filled in from their profile.

THE ONE THING THAT MATTERS: a lead has to be callable, and worth calling. That
means a name and a phone number always, and then the smallest number of extra
questions that stop the office ringing people they cannot help.

PREFILLED VERSUS TYPED. Meta fills FULL_NAME, PHONE, EMAIL, CITY, ZIP,
STREET_ADDRESS and the rest from the viewer's profile, so those cost almost
nothing in completion rate. A CUSTOM question is typed by hand and costs real
completions -- every one has to earn its place. One typed question is normal.
Two is the most you should ever recommend, and only when the second genuinely
changes who gets called first.

ALWAYS INCLUDE FULL_NAME and PHONE. Nothing else is a lead.

ZIP IS ALMOST ALWAYS WORTH IT, and this is from a real loss: a water treatment
client took a lead from three hours outside their service area and somebody
nearly drove it. Meta's location targeting includes people "recently in" an
area and cannot be made to exclude them, so ZIP does not stop the lead
arriving -- it puts the location in front of whoever reads it first. It is
prefilled, so it is nearly free.

EMAIL is worth it as the fallback when nobody answers the phone. Include it
unless the client has said they only call.

WHAT MAKES A GOOD CUSTOM QUESTION: it sorts the list. "What is going on with
your unit?" tells a dispatcher whether this is an emergency. "Is this for a
home you own or rent?" filters out tenants who cannot authorise work. "When
did you want this done?" separates now from someday. Ask it the way the owner
would ask it on the phone, in their words, and keep it under about twelve
words.

WHAT MAKES A BAD ONE: anything the business can look up itself, anything with
an obvious answer, anything that reads like a survey, and anything asking for
a budget -- people lie about budget on forms and it costs completions.

If the client told you in their onboarding form what they need to know from a
lead, that answer outranks your own judgement. Use their wording.

The thank-you line is read straight after somebody submits. Say what happens
next and when, in one plain sentence, and never promise a timeframe the client
has not said they can hit.

In the note, say in one or two sentences why this set and what you left out.`

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

/** The last chat with this client, flattened to plain text. */
async function transcript(supabaseUrl: string, db: Record<string, string>, clientId: string) {
  const chat = await fetch(
    `${supabaseUrl}/rest/v1/client_chats?client_id=eq.${encodeURIComponent(clientId)}` +
      `&select=id&order=updated_at.desc&limit=1`,
    { headers: db }
  )
    .then((r) => r.json())
    .then((rows) => rows?.[0])
  if (!chat?.id) return ''

  const rows = await fetch(
    `${supabaseUrl}/rest/v1/chat_messages?chat_id=eq.${encodeURIComponent(chat.id)}` +
      `&select=role,content&order=created_at.asc`,
    { headers: db }
  ).then((r) => r.json())

  const text = (rows || [])
    .map((m: any) => {
      const blocks = Array.isArray(m.content) ? m.content : []
      const said = blocks
        .filter((b: any) => b?.type === 'text')
        .map((b: any) => b.text)
        .join('\n')
      return said ? `${m.role === 'user' ? 'Agency' : 'Assistant'}: ${said}` : ''
    })
    .filter(Boolean)
    .join('\n\n')

  // The END of the conversation, not the start: the offer and the angle get
  // settled late, and the early turns are usually the brief being read out.
  return text.length > 12000 ? text.slice(-12000) : text
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  const clientId = String(body.client_id || '').trim()
  if (!clientId) return json({ error: 'client_id is required.' }, 400)

  try {
    const client = await fetch(
      `${supabaseUrl}/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}` +
        `&select=id,name,industry,market,website_url`,
      { headers: db }
    )
      .then((r) => r.json())
      .then((rows) => rows?.[0])
    if (!client) return json({ error: 'That client was not found.' }, 400)

    const intake = await fetch(
      `${supabaseUrl}/rest/v1/onboarding_intake?client_id=eq.${encodeURIComponent(clientId)}&select=*`,
      { headers: db }
    )
      .then((r) => r.json())
      .then((rows) => rows?.[0] || {})

    const said = await transcript(supabaseUrl, db, clientId)

    // The client's own answers first, because the system prompt tells the
    // model they outrank its judgement.
    const facts = [
      ['Business', client.name],
      ['Trade', client.industry || intake.industry_trade],
      ['Area served', client.market || intake.service_area],
      ['WHAT THEY SAID THEY NEED TO KNOW FROM A LEAD', intake.lead_form_questions],
      ['Services they want more of', intake.service_want_more || intake.services_offered],
      ['Most profitable service', intake.most_profitable_service],
      ['The offer', intake.offer_headline || intake.current_offers_guarantees],
      ['Guarantee', intake.guarantee],
      ['Typical price range', intake.typical_price_range],
      ['Their best customer', intake.ideal_customer],
      ['How fast they answer a lead', intake.response_time_to_lead],
      ['Who answers the leads', intake.who_answers_leads],
      ['Where leads go', intake.leads_go_to],
      ['The fine print on the offer', intake.offer_fine_print],
      ['What the button should say', intake.cta_offering],
    ]
      .map(([label, value]) => [label, String(value ?? '').trim()])
      .filter(([, value]) => value)
      .map(([label, value]) => `${label}: ${value.slice(0, 600)}`)
      .join('\n')

    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      output_config: { format: zodOutputFormat(Reply, 'form_questions') },
      messages: [
        {
          role: 'user',
          content:
            `${facts}\n\n` +
            (said
              ? `THE LATEST CONVERSATION about this client's ads, which is where the offer and the angle were worked out:\n"""\n${said}\n"""\n\n`
              : '') +
            'Recommend the questions for their instant form.',
        },
      ],
    })

    const parsed = response.parsed_output
    if (!parsed) {
      return json({ error: 'Claude replied but not in a readable shape. Try again.' }, 502)
    }

    return json({
      note: parsed.note,
      form_name: parsed.form_name,
      thank_you: parsed.thank_you,
      // Belt and braces on the type even though the schema constrains it: a
      // type meta-publish does not accept would be dropped there and the form
      // would quietly not ask the question.
      questions: parsed.questions.filter(
        (q) => q.type === 'CUSTOM' || (STANDARD as readonly string[]).includes(q.type)
      ),
      used_chat: Boolean(said),
    })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: 'Rate limited by Anthropic. Give it a few seconds.' }, 429)
    }
    if (err instanceof Anthropic.APIError) {
      return json({ error: `Anthropic returned ${err.status}: ${err.message}` }, 502)
    }
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
