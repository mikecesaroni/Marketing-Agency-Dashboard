// Reads a client's website and saves what it says as a fact sheet on the
// client row, which the client chat carries in every brief. That is what lets
// "write me video scripts" use their real offers, guarantees, towns and
// review quotes without anybody typing them in.
//
// POST { client_id }            read the site on file and save the fact sheet
// POST { client_id, url }       read this address instead (remembered as
//                               website_profile_url, the last fallback next time)
// POST { client_id, dry_run }   list the pages it would read, save nothing
//
// It reads the home page, then up to seven more pages of the same site picked
// by what they are about (services, about, reviews, specials, financing,
// service area, maintenance plans), strips them to text and has Claude write
// the fact sheet. Only what the site actually says goes in. A page drawn by
// JavaScript (an empty shell to a plain fetch) goes through a reader service
// that renders it; see fetchRendered.
//
// Secrets: ANTHROPIC_API_KEY (already set for the client chat).

const MODEL = 'claude-opus-5'
const MAX_PAGES = 8
const PAGE_CHARS = 12000
const TOTAL_CHARS = 70000
const FETCH_MS = 12000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

/** A usable web address from whatever was typed, or '' (street addresses get typed here too). */
export function siteUrl(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s || /\s/.test(s) || !/\.[a-z]{2,}/i.test(s)) return ''
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
    if (!/^https?:$/.test(u.protocol) || !isPublicHost(u.hostname)) return ''
    u.hash = ''
    return u.toString()
  } catch {
    return ''
  }
}

/** Never fetch the machine's own network: this runs server side. */
export function isPublicHost(host: string): boolean {
  const h = host.toLowerCase()
  if (!h.includes('.') || /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/.test(h)) return false
  const ip = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])]
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return false
  }
  if (h.startsWith('[') || h.includes(':')) return false
  return true
}

/** Intake first (the owner typed it), then the client row, then the GHL form, then the last address read. */
export function pickWebsite(sources: unknown[]): string {
  for (const s of sources) {
    const u = siteUrl(s)
    if (u) return u
  }
  return ''
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', hellip: '...', copy: '(c)', reg: '(R)', trade: '(TM)' }

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
}

/** The readable words on a page, with headings and list items on their own lines. */
export function htmlToText(html: string): string {
  return decode(
    String(html || '')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|hr)\b[^>]*>/gi, '\n')
      .replace(/<\/?(p|div|section|article|header|footer|li|ul|ol|h[1-6]|tr|td|th|table|blockquote|nav|main|aside|form|label|button|a)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    // Menus and footers repeat the same short lines on every page.
    .filter((l, i, all) => l.length > 40 || all.indexOf(l) === i)
    .join('\n')
}

/** Title, description and any structured business data (phone, rating, hours). */
export function pageMeta(html: string): { title: string; description: string; structured: string[] } {
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim())
  const description = decode(
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ||
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1] ||
      ''
  ).trim()
  const structured = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1].trim())
    .filter((s) => /LocalBusiness|HVAC|Plumb|Roof|Electric|Organization|aggregateRating|telephone|Service/i.test(s))
    .map((s) => s.replace(/\s+/g, ' ').slice(0, 3000))
  return { title, description, structured }
}

type Link = { url: string; text: string }

/** Links to other pages on the same site, cleaned and de-duplicated. */
export function sameSiteLinks(html: string, base: string): Link[] {
  const root = new URL(base)
  const host = root.hostname.replace(/^www\./, '')
  const seen = new Set<string>()
  const out: Link[] = []
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (m[1].startsWith('#')) continue
    let u: URL
    try {
      u = new URL(decode(m[1]), root)
    } catch {
      continue
    }
    if (!/^https?:$/.test(u.protocol) || u.hostname.replace(/^www\./, '') !== host) continue
    if (/\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|mov|docx?|xlsx?)$/i.test(u.pathname)) continue
    u.hash = ''
    u.search = ''
    const key = u.toString().replace(/\/$/, '')
    if (seen.has(key) || key === root.origin || key === base.replace(/\/$/, '')) continue
    seen.add(key)
    out.push({ url: u.toString(), text: htmlToText(m[2]).replace(/\s+/g, ' ').slice(0, 80) })
  }
  return out
}

// What each kind of page is worth to a script writer, and how to spot it.
const PAGE_KINDS: [string, RegExp][] = [
  ['specials', /special|coupon|offer|promo|deal|discount|rebate/i],
  ['reviews', /review|testimonial|what.*(customers|clients).*say/i],
  ['about', /about|our.?story|who.?we.?are|meet|team|why.?(us|choose)/i],
  ['financing', /financ|payment.?plan|credit/i],
  ['plans', /maintenance|membership|club|\bplans?\b|agreement|protection/i],
  ['guarantee', /guarantee|warrant/i],
  ['areas', /service.?area|areas|locations|cities|communities|where.?we/i],
  ['services', /service|repair|install|replace|heating|cooling|furnace|air.?cond|ac-|hvac|plumb|drain|water.?heater|roof|electric|panel|generator|wash|lawn|pool|pest|mini.?split|heat.?pump|boiler|duct/i],
  ['faq', /faq|questions/i],
]
const SKIP = /privacy|terms|policy|login|account|cart|checkout|careers|jobs|employment|sitemap|feed|wp-json|tag\/|category\/|author\/|\/page\/\d|blog\/.+|news\/.+|cdn-cgi|mailto:|tel:/i

/** The pages worth reading: one of each kind first, then more service pages. */
export function pickPages(links: Link[], max = MAX_PAGES - 1): { url: string; kind: string }[] {
  const scored = links
    .filter((l) => !SKIP.test(l.url))
    .map((l) => {
      const hay = `${new URL(l.url).pathname} ${l.text}`
      const kind = PAGE_KINDS.find(([, re]) => re.test(hay))?.[0] || ''
      const depth = new URL(l.url).pathname.split('/').filter(Boolean).length
      return { url: l.url, kind, depth }
    })
    .filter((l) => l.kind && l.depth <= 3)
  const picked: { url: string; kind: string }[] = []
  for (const [kind] of PAGE_KINDS) {
    const hit = scored.filter((l) => l.kind === kind).sort((a, b) => a.depth - b.depth)[0]
    if (hit && picked.length < max) picked.push({ url: hit.url, kind })
  }
  for (const l of scored.filter((x) => x.kind === 'services').sort((a, b) => a.depth - b.depth)) {
    if (picked.length >= max) break
    if (!picked.some((p) => p.url === l.url)) picked.push({ url: l.url, kind: 'services' })
  }
  return picked
}

async function fetchPage(url: string): Promise<{ url: string; html: string } | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), FETCH_MS)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: ctl.signal })
    if (!res.ok) return null
    if (!/html/i.test(res.headers.get('content-type') || 'text/html')) return null
    const finalUrl = res.url || url
    if (!isPublicHost(new URL(finalUrl).hostname)) return null
    const html = (await res.text()).slice(0, 600000)
    return { url: finalUrl, html }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Some sites (Belk's, many site builders) send an empty shell and draw the
// page with JavaScript, so a plain fetch finds no words and no links. For
// those, a public reader service loads the page in a real browser and hands
// back its text. Only the public web address goes to it.
const RENDER_URL = 'https://r.jina.ai/'
const RENDER_MS = 40000
// Below this many characters of text a page is taken to be a shell.
export const SHELL_CHARS = 400

async function fetchRendered(url: string): Promise<string | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), RENDER_MS)
  try {
    const res = await fetch(`${RENDER_URL}${url}`, { headers: { Accept: 'text/plain', 'X-Return-Format': 'markdown' }, signal: ctl.signal })
    if (!res.ok) return null
    return (await res.text()).slice(0, 300000)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** The reader service's answer: a "Title:" header, then the page as markdown. */
export function parseRendered(body: string): { title: string; markdown: string } {
  const s = String(body || '')
  const title = s.match(/^Title:\s*(.*)$/m)?.[1]?.trim() || ''
  const i = s.indexOf('Markdown Content:')
  return { title, markdown: (i >= 0 ? s.slice(i + 'Markdown Content:'.length) : s).trim() }
}

/** Markdown to plain lines: images dropped, links kept as their words. */
export function markdownToText(md: string): string {
  return String(md || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^[-=|: ]+$/.test(l))
    .filter((l, i, all) => l.length > 40 || all.indexOf(l) === i)
    .join('\n')
}

/** Same-site links out of markdown, in the shape sameSiteLinks gives. */
export function markdownLinks(md: string, base: string): Link[] {
  const anchors = [...String(md || '').matchAll(/\[((?:[^\[\]]|\[[^\]]*\])*)\]\((https?:\/\/[^)\s]+)\)/g)]
    .map((m) => `<a href="${m[2]}">${markdownToText(m[1])}</a>`)
    .join('')
  return sameSiteLinks(anchors, base)
}

type Page = { url: string; kind: string; text: string; meta: ReturnType<typeof pageMeta>; links: Link[]; rendered: boolean }

/** One page, as plain HTML when that has words, through the reader when it does not. */
async function readPage(url: string, kind: string): Promise<Page | null> {
  // A broken certificate is common on small business sites; the plain http
  // address usually still answers.
  const raw = (await fetchPage(url)) || (url.startsWith('https://') ? await fetchPage(`http://${url.slice(8)}`) : null)
  const text = raw ? htmlToText(raw.html) : ''
  if (raw && text.length >= SHELL_CHARS) {
    return { url: raw.url, kind, text, meta: pageMeta(raw.html), links: sameSiteLinks(raw.html, raw.url), rendered: false }
  }
  const body = await fetchRendered(raw?.url || url)
  if (body) {
    const { title, markdown } = parseRendered(body)
    const words = markdownToText(markdown)
    if (words.length > text.length) {
      const meta = raw ? pageMeta(raw.html) : { title: '', description: '', structured: [] }
      return { url: raw?.url || url, kind, text: words, meta: { ...meta, title: meta.title || title }, links: markdownLinks(markdown, raw?.url || url), rendered: true }
    }
  }
  return raw ? { url: raw.url, kind, text, meta: pageMeta(raw.html), links: sameSiteLinks(raw.html, raw.url), rendered: false } : null
}

const INSTRUCTIONS = `You are reading a home-services business's own website so an ad agency can write video scripts and ads in their voice. Write a fact sheet from the pages below.

Rules:
- Only what the website actually says. Never guess, never fill in typical industry claims. If a section has nothing on the site, leave the section out entirely.
- Keep their exact wording for offers, prices, guarantees, slogans and taglines, in quotes.
- Customer quotes must be real quotes from the pages, short, with the first name or initials if shown.
- Plain text. No markdown, no asterisks, no square brackets, no em dashes.
- Short lines. This sheet is read by another AI before every answer, so every line must earn its place.

Use these section labels, in this order, each on its own line followed by lines starting with "- ":

WHO THEY ARE
SERVICES
BRANDS AND EQUIPMENT
SERVICE AREA
OFFERS AND SPECIALS
GUARANTEES AND WARRANTIES
FINANCING
MAINTENANCE PLAN
PROOF
CUSTOMER QUOTES
HOW THEY TALK
CONTACT
SCRIPT ANGLES
MISSING FROM THE SITE

Notes on the sections:
- WHO THEY ARE: name, owner if named, family owned or not, years in business, the story in one or two lines.
- PROOF: years in business, star rating and review count if shown, licenses, certifications, awards, associations.
- HOW THEY TALK: their tone in a few words, and any phrases or taglines they repeat.
- CONTACT: phone, hours, emergency or 24/7 service, same-day service.
- SCRIPT ANGLES: five angles for owner videos that this site gives real material for, one line each.
- MISSING FROM THE SITE: things an ad would want that the site does not say (no offer, no review count, no guarantee), so nobody invents them.

Start with the first section label. Nothing before it and nothing after the last section.`

async function writeFactSheet(apiKey: string, name: string, pages: Page[]) {
  const { default: Anthropic } = await import('npm:@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })
  let budget = TOTAL_CHARS
  const corpus = pages
    .map((p) => {
      const head = [`=== PAGE (${p.kind}): ${p.url} ===`, p.meta.title && `Title: ${p.meta.title}`, p.meta.description && `Description: ${p.meta.description}`, ...p.meta.structured.map((s) => `Structured data: ${s}`)]
        .filter(Boolean)
        .join('\n')
      const body = p.text.slice(0, Math.max(0, Math.min(PAGE_CHARS, budget)))
      budget -= body.length
      return `${head}\n${body}`
    })
    .join('\n\n')
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 6000,
    system: INSTRUCTIONS,
    messages: [{ role: 'user', content: `Business: ${name}\n\n${corpus}` }],
  })
  const msg = await stream.finalMessage()
  const text = msg.content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('\n')
    .replace(/[\u2014\u2013]/g, '-')
    .trim()
  return { text, usage: msg.usage }
}

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

export async function serve(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return json({}, 200)
  const env = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno!.env
  const apiKey = env.get('ANTHROPIC_API_KEY')
  const supabaseUrl = env.get('SUPABASE_URL')!
  const serviceKey = env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }

  let body: { client_id?: string; url?: string; dry_run?: boolean }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }
  if (!body.client_id) return json({ error: 'client_id is required' }, 400)
  const id = encodeURIComponent(body.client_id)

  // One retry: a single dropped database call should not read as "no such client".
  const get = async (path: string) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers }).catch(() => null)
      if (r?.ok) return r.json()
    }
    return null
  }
  const [clients, intakes, ghls] = await Promise.all([
    get(`clients?id=eq.${id}&select=id,name,website_url,website_profile_url,website_profile_error,website_profile`),
    get(`onboarding_intake?client_id=eq.${id}&select=website,business_name`),
    get(`ghl_setup?client_id=eq.${id}&select=website_url`),
  ])
  if (!clients) return json({ error: 'Could not read the client from the database. Try again.' }, 502)
  const client = clients[0]
  if (!client) return json({ error: 'No such client' }, 404)
  const name = intakes?.[0]?.business_name || client.name

  const typed = body.url ? siteUrl(body.url) : ''
  if (body.url && !typed) return json({ error: 'That does not look like a web address.' }, 400)
  // An address that last read cleanly comes first: it is either what the
  // forms say anyway, or a correction somebody typed in the chat (an intake
  // with a typo in the domain), which should stick.
  const lastGood = client.website_profile && !client.website_profile_error ? client.website_profile_url : ''
  const start = typed || pickWebsite([lastGood, intakes?.[0]?.website, client.website_url, ghls?.[0]?.website_url, client.website_profile_url])

  const save = async (fields: Record<string, unknown>) => {
    await fetch(`${supabaseUrl}/rest/v1/clients?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(fields),
    })
  }

  if (!start) {
    if (!body.dry_run) await save({ website_profile_error: 'No website on file.', website_profile_url: null })
    return json({ error: 'No website on file for this client. Add one and read it again.' }, 400)
  }

  // A saved address is often a landing page (/free-estimate); the home page
  // is where the menu to everything else is.
  const home = new URL(start).origin + '/'
  const [first, landing] = await Promise.all([readPage(home, 'home'), start !== home ? readPage(start, 'landing') : Promise.resolve(null)])
  if (!first && !landing) {
    const error = `Could not open ${home}. The site may be down or blocking readers.`
    if (!body.dry_run) await save({ website_profile_error: error, website_profile_url: start, website_profile_at: new Date().toISOString() })
    return json({ error }, 502)
  }

  const opened = [first, landing].filter(Boolean) as Page[]
  const picks = pickPages(opened.flatMap((p) => p.links)).filter((p) => !opened.some((o) => o.url.replace(/\/$/, '') === p.url.replace(/\/$/, '')))
  const room = MAX_PAGES - opened.length
  if (body.dry_run) {
    return json({ ok: true, start, pages: [...opened.map((p) => ({ url: p.url, kind: p.kind, rendered: p.rendered, chars: p.text.length })), ...picks.slice(0, room)] })
  }
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY is not set on this project.' }, 500)

  const others = (await Promise.all(picks.slice(0, room).map((p) => readPage(p.url, p.kind)))).filter(Boolean) as Page[]
  const pages = [...opened, ...others]

  const words = pages.reduce((n, p) => n + p.text.length, 0)
  if (words < 200) {
    const error = 'The site loaded but had almost no readable text, even through the page reader. Paste the key facts into the chat instead.'
    await save({ website_profile_error: error, website_profile_url: start, website_profile_at: new Date().toISOString() })
    return json({ error, pages: pages.map((p) => p.url) }, 422)
  }

  try {
    const sheet = await writeFactSheet(apiKey, name, pages)
    if (!sheet.text) throw new Error('Claude returned an empty fact sheet.')
    await save({
      website_profile: sheet.text,
      website_profile_at: new Date().toISOString(),
      website_profile_url: start,
      website_profile_pages: pages.map((p) => p.url),
      website_profile_error: null,
    })
    return json({ ok: true, url: start, pages: pages.map((p) => ({ url: p.url, kind: p.kind })), profile: sheet.text, usage: sheet.usage })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await save({ website_profile_error: error, website_profile_at: new Date().toISOString() })
    return json({ error }, 500)
  }
}

const deno = (globalThis as { Deno?: { serve?: (h: (req: Request) => Promise<Response>) => void } }).Deno
if (typeof deno?.serve === 'function') deno.serve(serve)
