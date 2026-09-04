// Lists and builds Meta instant forms on a client's Facebook Page.
//
// WHY THIS IS NOT IN meta-publish, WHICH ALREADY HAS BOTH ACTIONS.
//
// meta-publish's create_lead_form has never worked when a thank-you message
// is set: Meta answers (#100) "Button text is missing for Thank You Page"
// because button_text was absent. LeadFormPicker prefills a thank-you
// message, so that was every create the CRM has ever attempted. Found by
// calling it for real rather than by reading it.
//
// The fix is one field. meta-publish is 1,944 lines and is the code that
// creates every campaign, ad set and ad for a live agency, and deploying it
// means re-sending the whole file -- so a fix worth four lines would have been
// carried by a transcription of the entire money path. Weighed against
// duplicating a hundred lines of Graph scaffolding here, that is the worse
// risk, so the form actions moved instead.
//
// meta-publish's own branch is now unreachable from the app: metaPublish.js
// points list and create at this function. Its source in the repo carries the
// same fix, so whenever it is next deployed for its own reasons the two agree.
//
// Secrets: META_ACCESS_TOKEN.

const GRAPH = 'https://graph.facebook.com/v21.0'

// Standard fields Meta prefills from the viewer's profile. Kept identical to
// meta-publish's list: a type outside it is dropped rather than sent, so a
// mismatch would mean a question that looks accepted and is not on the form.
const STANDARD_QUESTIONS = new Set([
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
])

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function buildQuestions(questions: any[]): Record<string, string>[] {
  const built: Record<string, string>[] = []
  for (const q of questions || []) {
    const type = String(q?.type || '').toUpperCase()
    if (STANDARD_QUESTIONS.has(type)) {
      built.push({ type })
    } else if (type === 'CUSTOM' && q?.label) {
      built.push({
        type: 'CUSTOM',
        label: String(q.label),
        // Meta keys the answer by this, and it is what shows up in the CSV
        // export and in a GoHighLevel mapping, so it has to be stable and
        // free of punctuation.
        key: String(q.key || q.label)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 60),
      })
    }
  }
  return built
}

/**
 * The Page's own access token. A form lives on the Page, and the System User
 * token is not always accepted for Page-owned edges.
 */
async function pageToken(pageId: string, token: string): Promise<string> {
  try {
    const res = await fetch(
      `${GRAPH}/me/accounts?fields=id,access_token&limit=100&access_token=${encodeURIComponent(token)}`
    )
    const body = await res.json()
    const match = (body?.data || []).find((p: any) => String(p.id) === String(pageId))
    if (match?.access_token) return match.access_token
  } catch {
    // Not fatal: the direct read below may still work.
  }
  try {
    const res = await fetch(
      `${GRAPH}/${pageId}?fields=access_token&access_token=${encodeURIComponent(token)}`
    )
    const body = await res.json()
    return body?.access_token || token
  } catch {
    // Handing back the System User token makes the caller fail with a Meta
    // error that names the Page, rather than refusing pre-emptively -- some
    // setups do accept it.
    return token
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)

  const token = Deno.env.get('META_ACCESS_TOKEN')
  if (!token) return json({ error: 'META_ACCESS_TOKEN is not set on this project.' }, 500)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  const clientId = String(body.client_id || '').trim()
  if (!clientId) return json({ error: 'client_id is required.' }, 400)
  const action = body.action || 'list'

  try {
    const client = await fetch(
      `${supabaseUrl}/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}` +
        `&select=id,name,meta_page_id,privacy_policy_url,website_url`,
      { headers: db }
    )
      .then((r) => r.json())
      .then((rows) => rows?.[0])

    // 400 rather than 404: the browser reads a 404 from this gateway as "the
    // function is not deployed", so a missing row must not look like one.
    if (!client) return json({ error: 'That client was not found.' }, 400)
    if (!client.meta_page_id) {
      return json(
        {
          error: `${client.name} has no Facebook Page ID set. Instant forms live on the Page, so there is nowhere to put one yet.`,
        },
        400
      )
    }

    const pToken = await pageToken(client.meta_page_id, token)

    if (action === 'list') {
      const res = await fetch(
        `${GRAPH}/${client.meta_page_id}/leadgen_forms` +
          `?fields=id,name,status,leads_count,created_time&limit=50` +
          `&access_token=${encodeURIComponent(pToken)}`
      )
      const found = await res.json()
      if (!res.ok) {
        return json({ error: found?.error?.message || `Meta returned ${res.status}` }, 502)
      }
      // leads_count is the reason to reuse a form rather than make a new one
      // per ad: a form owns its leads, so five near-identical forms means five
      // places to go looking for them.
      return json({ forms: found.data || [] })
    }

    if (action !== 'create') return json({ error: `Unknown action "${action}".` }, 400)

    const questions = buildQuestions(body.questions)
    if (questions.length === 0) return json({ error: 'A form needs at least one question.' }, 400)

    const privacyUrl = String(body.privacy_policy_url || client.privacy_policy_url || '').trim()
    if (!privacyUrl) {
      return json(
        {
          error: `Meta requires a privacy policy URL on every instant form. None of the clients here have one on file yet — paste one on the form, or add it to ${client.name}'s Meta card.`,
          needs_privacy_url: true,
        },
        400
      )
    }

    const site = String(body.follow_up_url || client.website_url || '').trim()

    const payload: Record<string, string> = {
      name: String(body.form_name || `${client.name} — enquiries`),
      questions: JSON.stringify(questions),
      privacy_policy: JSON.stringify({ url: privacyUrl, link_text: 'Privacy Policy' }),
      // Meta wants somewhere to send people after they submit. The client's
      // own site is the natural answer; the privacy page is a valid fallback
      // for the field itself, which is not the same as putting it on a button.
      follow_up_action_url: site || privacyUrl,
      locale: 'EN_US',
      // The form is only reachable from the ad, so there is no reason to hide
      // it from people the ad was not targeted at.
      block_display_for_non_targeted_viewer: 'false',
    }

    if (body.thank_you_message) {
      // THE TWO THINGS THAT WERE WRONG.
      //
      // button_text is required whenever button_type is VIEW_WEBSITE, and its
      // absence is why this call has always failed with (#100) "Button text is
      // missing for Thank You Page".
      //
      // And the button only belongs there when there is somewhere worth going.
      // The old fallback chain ended at the privacy policy, so a homeowner who
      // had just asked for a quote would be offered a privacy notice. Meta
      // accepts button_type NONE -- verified against the live API alongside
      // the VIEW_WEBSITE shape -- so with no website the form just says thanks.
      payload.thank_you_page = JSON.stringify({
        title: 'Thanks — we got it',
        body: String(body.thank_you_message),
        ...(site
          ? { button_type: 'VIEW_WEBSITE', button_text: 'Visit our website', website_url: site }
          : { button_type: 'NONE' }),
      })
    }

    const form = new URLSearchParams(payload)
    form.set('access_token', pToken)

    const res = await fetch(`${GRAPH}/${client.meta_page_id}/leadgen_forms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    const made = await res.json()

    if (!res.ok || !made?.id) {
      const detail =
        made?.error?.error_user_msg || made?.error?.message || `Meta returned ${res.status}`
      return json({ error: `Could not create the form: ${detail}` }, 502)
    }

    return json({ ok: true, form_id: made.id, name: payload.name })
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
