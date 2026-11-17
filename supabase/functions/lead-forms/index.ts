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
//
// v2: CUSTOM questions with two or more options are sent as multiple choice.
// v3: Higher Intent (review screen) on by default via is_optimized_for_quality.
// v4: list returns each form's questions, thank-you page, privacy URL and
//     intent setting, so the Studio can show what an existing form asks and
//     reuse it, instead of a name and an id that mean nothing a week later.
// v5: the intro card (context_card: a title, bullet lines, a button), the
//     question page headline, and a COVER PHOTO sent as a file on the create
//     call, from a data URL the Studio makes out of the client's upload or
//     their Drive photo ("add a background photo on the form, pulled from
//     Drive"). list returns the intro card and headline too, so "start from
//     this form" carries them. A cover Meta refuses (the token lacks
//     pages_manage_posts, or the picture is wrong) fails the create with
//     cover_refused, so the Studio can offer the same form without it.

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

// The most a cover photo may weigh on the wire. The Studio sends a JPEG no
// wider than 1200px, a few hundred kilobytes; anything near this is a raw
// phone photo that slipped through.
const COVER_MAX_BYTES = 4 * 1024 * 1024

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

// Meta keys answers (and options) by this, and it is what shows up in the CSV
// export and in a GoHighLevel mapping, so it has to be stable and free of
// punctuation.
function slug(text: string, max = 60): string {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max)
}

// Every form the CRM makes is named WC_..., the way its ads are
// (src/lib/adNaming.js wcName), so ours stand out from the client's own.
function wcName(name: string): string {
  const clean = String(name ?? '').trim()
  if (!clean) return clean
  return clean.toUpperCase().startsWith('WC_') ? clean : `WC_${clean}`
}

function buildQuestions(questions: any[]): Record<string, unknown>[] {
  const built: Record<string, unknown>[] = []
  for (const q of questions || []) {
    const type = String(q?.type || '').toUpperCase()
    if (STANDARD_QUESTIONS.has(type)) {
      built.push({ type })
    } else if (type === 'CUSTOM' && q?.label) {
      const question: Record<string, unknown> = {
        type: 'CUSTOM',
        label: String(q.label),
        key: slug(q.key || q.label),
      }
      // Two or more options make it MULTIPLE CHOICE on the form: the person
      // taps one instead of typing. Meta wants each option as {key, value}
      // and the keys unique within the question. Fewer than two options is a
      // typed question, so the list is dropped rather than sent half-formed.
      const options = (Array.isArray(q.options) ? q.options : [])
        .map((o: unknown) => String(o ?? '').trim())
        .filter(Boolean)
      if (options.length >= 2) {
        const seen = new Set<string>()
        question.options = options.map((value, i) => {
          let key = slug(value, 40) || `option_${i + 1}`
          while (seen.has(key)) key = `${key}_${i + 1}`
          seen.add(key)
          return { key, value }
        })
      }
      built.push(question)
    }
  }
  return built
}

/**
 * The intro card, from what the Studio sent: a title, up to five lines (a
 * list when there is more than one, a paragraph otherwise) and the button
 * that opens the questions. Nothing when nothing was typed.
 */
function buildContextCard(intro: any, fallbackTitle: string): Record<string, unknown> | null {
  if (!intro || typeof intro !== 'object') return null
  const title = String(intro.title || '').trim().slice(0, 60)
  const content = (Array.isArray(intro.content) ? intro.content : [])
    .map((s: unknown) => String(s ?? '').trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((s: string) => s.slice(0, 80))
  if (!title && content.length === 0) return null
  return {
    title: title || fallbackTitle.slice(0, 60),
    style: content.length > 1 ? 'LIST_STYLE' : 'PARAGRAPH_STYLE',
    content: content.length ? content : [title],
    button_text: String(intro.button_text || '').trim().slice(0, 30) || 'Continue',
  }
}

/** A data URL's bytes and type, or null for anything that is not a JPEG, PNG or WebP picture. */
function parseCover(dataUrl: unknown): { bytes: Uint8Array; mime: string } | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''))
  if (!m) return null
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, mime: m[1] }
}

/**
 * The Page's own access token. A form lives on the Page, and the System User
 * token is not always accepted for Page-owned edges.
 *
 * `page` says whether a real Page token was found. It is not when the system
 * user has not been assigned the Page in Business Settings (2026-11-16:
 * Active Air Quality's Page was shared with the business, full access, but
 * not assigned to the system user, and creating a form came back "(#200)
 * Permissions error" with nothing to say why). Reading forms can still work
 * with the System User token, so the list reports it and a refused create
 * names the fix.
 */
async function pageToken(pageId: string, token: string): Promise<{ token: string; page: boolean; tasks?: string[] }> {
  try {
    const res = await fetch(
      `${GRAPH}/me/accounts?fields=id,access_token,tasks&limit=100&access_token=${encodeURIComponent(token)}`
    )
    const body = await res.json()
    const match = (body?.data || []).find((p: any) => String(p.id) === String(pageId))
    if (match?.access_token) return { token: match.access_token, page: true, tasks: Array.isArray(match.tasks) ? match.tasks.map(String) : undefined }
  } catch {
    // Not fatal: the direct read below may still work.
  }
  try {
    const res = await fetch(
      `${GRAPH}/${pageId}?fields=access_token&access_token=${encodeURIComponent(token)}`
    )
    const body = await res.json()
    return body?.access_token ? { token: body.access_token, page: true } : { token, page: false }
  } catch {
    // Handing back the System User token makes the caller fail with a Meta
    // error that names the Page, rather than refusing pre-emptively -- some
    // setups do accept it.
    return { token, page: false }
  }
}

/**
 * Whether the Page has accepted Meta's Lead Ads terms. A Page's first instant
 * form needs them, and a create without them comes back as a bare "(#200)
 * Permissions error" (2026-11-16, Active Air Quality: Page token fine, no
 * forms ever). null when Meta will not say.
 */
async function leadTermsAccepted(pageId: string, pToken: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${GRAPH}/${pageId}?fields=leadgen_tos_accepted&access_token=${encodeURIComponent(pToken)}`)
    const body = await res.json()
    return typeof body?.leadgen_tos_accepted === 'boolean' ? body.leadgen_tos_accepted : null
  } catch {
    return null
  }
}

/** What to do when the Page has not accepted the Lead Ads terms. */
export function leadTermsHelp(clientName: string, pageId: string): string {
  return (
    `${clientName}'s Facebook Page has not accepted Meta's Lead Ads terms yet, and a Page needs them before its first instant form. ` +
    `Someone with full control of the Page opens https://www.facebook.com/ads/leadgen/tos?page_id=${pageId}, accepts, then try again.`
  )
}

/** What to do when the system user is not assigned the Page. */
export function notAssignedHelp(clientName: string): string {
  return (
    `the CRM's Meta login (our system user) is not assigned to ${clientName}'s Facebook Page. ` +
    `In Meta Business Settings go to Users, then System users, pick ours, click Assign assets, ` +
    `choose Pages, tick ${clientName}'s Page, turn on full control (Manage Page) and save. Then try again.`
  )
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

    const { token: pToken, page: hasPageToken, tasks: pageTasks } = await pageToken(client.meta_page_id, token)

    if (action === 'list') {
      const res = await fetch(
        `${GRAPH}/${client.meta_page_id}/leadgen_forms` +
          `?fields=id,name,status,leads_count,expired_leads_count,created_time,` +
          `questions{type,key,label,options},privacy_policy_url,thank_you_page,` +
          `follow_up_action_url,is_optimized_for_quality,question_page_custom_headline,` +
          `context_card{title,style,content,button_text}&limit=50` +
          `&access_token=${encodeURIComponent(pToken)}`
      )
      const found = await res.json()
      if (!res.ok) {
        return json({ error: found?.error?.message || `Meta returned ${res.status}` }, 502)
      }
      // leads_count is the reason to reuse a form rather than make a new one
      // per ad: a form owns its leads, so five near-identical forms means five
      // places to go looking for them.
      return json({
        forms: found.data || [],
        page_access: hasPageToken,
        page_tasks: pageTasks ?? null,
        lead_terms_accepted: await leadTermsAccepted(client.meta_page_id, pToken),
      })
    }

    // DELETE (2026-11-16, "make so I can delete forms from the CRM too").
    // Meta's API does not delete an instant form; it archives it, which is
    // also what deleting a used form does in Meta's own screens: it leaves
    // the forms list, cannot be picked for a new ad, and its leads stay
    // downloadable. The form must be on this client's Page, so an id typed
    // or pasted from another client is refused before Meta is asked.
    if (action === 'archive') {
      const formId = String(body.form_id || '').trim()
      if (!/^\d{5,30}$/.test(formId)) return json({ error: 'That is not a form id.' }, 400)
      const look = await fetch(`${GRAPH}/${formId}?fields=id,name,status,page&access_token=${encodeURIComponent(pToken)}`)
      const found = await look.json().catch(() => null)
      if (!look.ok || !found?.id) {
        return json({ error: `Could not find that form on Meta: ${found?.error?.message || `Meta returned ${look.status}`}` }, 502)
      }
      if (found.page?.id && String(found.page.id) !== String(client.meta_page_id)) {
        return json({ error: `That form is not on ${client.name}'s Facebook Page, so it was left alone.` }, 400)
      }
      if (String(found.status || '').toUpperCase() === 'ARCHIVED') return json({ ok: true, form_id: formId, name: found.name, already: true })
      const res = await fetch(`${GRAPH}/${formId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ status: 'ARCHIVED', access_token: pToken }),
      })
      const done = await res.json().catch(() => null)
      if (!res.ok || done?.success === false || done?.error) {
        const e = done?.error || {}
        console.error('lead-forms archive refused', client.name, formId, JSON.stringify({ code: e.code, subcode: e.error_subcode, msg: e.message }))
        return json({ error: `Could not delete the form: ${e.error_user_msg || e.message || `Meta returned ${res.status}`}` }, 502)
      }
      return json({ ok: true, form_id: formId, name: found.name })
    }

    // INSPECT (2026-11-17, "the instant form did not carry over with the
    // photo I selected"): read back one form's intro card and its cover, as
    // Meta holds them. Read only.
    if (action === 'inspect') {
      const formId = String(body.form_id || '').trim()
      if (!/^\d{5,30}$/.test(formId)) return json({ error: 'That is not a form id.' }, 400)
      const read = async (fields: string) => {
        const r = await fetch(`${GRAPH}/${formId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(pToken)}`)
        return r.json().catch(() => null)
      }
      const withCover = await read('id,name,status,created_time,context_card{id,title,style,button_text,cover_photo{id,images}}')
      const plain = withCover?.error ? await read('id,name,status,created_time,context_card{id,title,style,button_text}') : null
      return json({ ok: true, form: plain || withCover, cover_read_error: withCover?.error?.message || null })
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
      // WC_ on the front, whatever the caller sent: every form the CRM makes
      // is named like its ads, so ours stand out from the client's own.
      name: wcName(String(body.form_name || `${client.name} — enquiries`)),
      questions: JSON.stringify(questions),
      privacy_policy: JSON.stringify({ url: privacyUrl, link_text: 'Privacy Policy' }),
      // Meta wants somewhere to send people after they submit. The client's
      // own site is the natural answer; the privacy page is a valid fallback
      // for the field itself, which is not the same as putting it on a button.
      follow_up_action_url: site || privacyUrl,
      locale: 'EN_US',
      // HIGHER INTENT. Meta shows a review screen before submit, which cuts
      // junk leads 30 to 40% for 15 to 20% fewer submissions. Every form the
      // CRM made before v3 was the More Volume kind because this was absent.
      // On unless the caller says otherwise, and the Studio only ever says
      // otherwise on purpose.
      is_optimized_for_quality: body.higher_intent === false ? 'false' : 'true',
      // The form is only reachable from the ad, so there is no reason to hide
      // it from people the ad was not targeted at.
      block_display_for_non_targeted_viewer: 'false',
    }

    // The headline over the questions, and the intro card before them. Both
    // optional; a form with neither is the form it always was.
    const headline = String(body.headline || '').trim().slice(0, 60)
    if (headline) payload.question_page_custom_headline = headline
    const card = buildContextCard(body.intro, headline || client.name)
    if (card) payload.context_card = JSON.stringify(card)

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

    // THE COVER PHOTO goes as a file, so the whole call is multipart when
    // there is one and the plain form it always was when there is not.
    const cover = body.cover_image ? parseCover(body.cover_image) : null
    if (body.cover_image && !cover) {
      return json({ error: 'The cover photo has to be a JPEG, PNG or WebP picture.', cover_refused: true }, 400)
    }
    if (cover && cover.bytes.length > COVER_MAX_BYTES) {
      return json({ error: 'The cover photo is too big to send. Pick a smaller photo.', cover_refused: true }, 400)
    }

    // THE COVER, IN TWO STEPS (2026-11-16). Sent as a file on the create
    // call, Meta refused every cover on every Page with a bare "(#200)
    // Permissions error", Horizon HVAC's own included, even after the token
    // was regenerated with pages_manage_posts. Meta's reference lists a
    // second way, cover_photo_id: the photo is put on the Page first,
    // unpublished (it never shows on the Page), and the form points at it.
    // A refusal now comes from the photo upload, with Meta's own words.
    let coverPhotoId = ''
    if (cover) {
      const up = new FormData()
      up.append('published', 'false')
      up.append('access_token', pToken)
      up.append('source', new Blob([cover.bytes], { type: cover.mime }), cover.mime === 'image/png' ? 'cover.png' : cover.mime === 'image/webp' ? 'cover.webp' : 'cover.jpg')
      const upRes = await fetch(`${GRAPH}/${client.meta_page_id}/photos`, { method: 'POST', body: up })
      const upBody = await upRes.json().catch(() => null)
      if (!upRes.ok || !upBody?.id) {
        const e = upBody?.error || {}
        const metaError = { code: e.code ?? null, subcode: e.error_subcode ?? null, type: e.type ?? null, title: e.error_user_title ?? null, user_msg: e.error_user_msg ?? null, fbtrace_id: e.fbtrace_id ?? null, step: 'photo upload' }
        console.error('lead-forms cover upload refused', client.name, JSON.stringify(metaError))
        const said = e.error_user_msg || e.message || `Meta returned ${upRes.status}`
        return json({ error: `Meta would not take the cover photo onto the Page: ${said}`, cover_refused: true, meta_error: metaError }, 502)
      }
      coverPhotoId = String(upBody.id)
    }

    const form = new URLSearchParams(payload)
    // The photo id goes INSIDE the intro card (2026-11-17): sent only as a
    // top-level cover_photo_id, Meta took the form and dropped the photo
    // without a word (read back with action "inspect": an intro card, no
    // cover_photo). It is also kept top-level, which Meta's reference lists.
    if (coverPhotoId) {
      form.set('cover_photo_id', coverPhotoId)
      if (card) form.set('context_card', JSON.stringify({ ...card, cover_photo_id: coverPhotoId }))
    }
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
      // No Page token and a permissions refusal: the Page is not assigned
      // to the system user. Say that, not "(#200) Permissions error".
      // Meta's whole answer, for when its message is too short to act on
      // ("(#200) Permissions error" says nothing about which permission).
      const metaError = made?.error
        ? {
            code: made.error.code ?? null,
            subcode: made.error.error_subcode ?? null,
            type: made.error.type ?? null,
            title: made.error.error_user_title ?? null,
            user_msg: made.error.error_user_msg ?? null,
            fbtrace_id: made.error.fbtrace_id ?? null,
          }
        : null
      console.error('lead-forms create refused', client.name, JSON.stringify(metaError), 'cover:', Boolean(cover))
      const permission = Number(made?.error?.code) === 200 || /permission/i.test(String(detail))
      if (permission && !hasPageToken) {
        return json({ error: `Could not create the form: ${notAssignedHelp(client.name)}`, page_access: false, cover_refused: false, meta_error: metaError }, 502)
      }
      if (permission && (await leadTermsAccepted(client.meta_page_id, pToken)) === false) {
        return json({ error: `Could not create the form: ${leadTermsHelp(client.name, client.meta_page_id)}`, lead_terms_accepted: false, cover_refused: false, meta_error: metaError }, 502)
      }
      // With a cover on the call, a refusal is most likely the cover (the
      // token lacking pages_manage_posts, the picture's shape or size), so
      // the Studio can offer the same form without it.
      return json({ error: `Could not create the form: ${detail}`, cover_refused: Boolean(cover), meta_error: metaError }, 502)
    }

    // Read the cover back rather than trust the send (2026-11-17): with the
    // photo id only top-level, Meta took the form and dropped the photo, and
    // the CRM said "cover photo and all".
    let withCover = false
    if (coverPhotoId) {
      try {
        const back = await fetch(`${GRAPH}/${made.id}?fields=${encodeURIComponent('context_card{cover_photo{id}}')}&access_token=${encodeURIComponent(pToken)}`)
        const got = await back.json()
        withCover = Boolean(got?.context_card?.cover_photo?.id)
      } catch {
        withCover = false
      }
    }
    return json({ ok: true, form_id: made.id, name: payload.name, with_cover: withCover, cover_dropped: Boolean(coverPhotoId) && !withCover })
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
