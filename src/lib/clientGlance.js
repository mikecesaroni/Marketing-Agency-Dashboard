// What the client page shows up front: who to call, where to write, their
// site, and a handful of numbers from the rest of the CRM. Pure, so the
// check script can pin the fallbacks and the arithmetic.

/**
 * Phone, email, website, owner and area, from whichever form has them.
 *
 * The onboarding intake is what the owner told us about the business, so it
 * wins. The GHL setup form is the fallback (it asks for a main phone and a
 * support email for the account), then the website on the client row.
 */
export function clientContact({ client = {}, intake = {}, ghl = {} } = {}) {
  const pick = (...vals) => vals.map((v) => (typeof v === 'string' ? v.trim() : v)).find((v) => v) || ''
  return {
    owner: pick(intake?.owner_name, ghl?.authorized_rep_name),
    phone: pick(intake?.contact_phone, ghl?.main_phone, intake?.phone_for_ads),
    email: pick(intake?.contact_email, ghl?.support_email),
    website: pick(intake?.website, ghl?.website_url, client?.website_url),
    area: pick(intake?.service_area, client?.market, ghl?.business_city),
  }
}

/** A tel: link a phone can dial, or '' when there are no digits. */
export function telHref(phone) {
  const s = String(phone || '').trim()
  const digits = s.replace(/[^\d+]/g, '')
  return digits.replace(/\D/g, '').length >= 7 ? `tel:${digits}` : ''
}

/** A clickable website: https added when it was typed bare. */
export function websiteHref(site) {
  const s = String(site || '').trim()
  if (!s) return ''
  return /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, '')}`
}

/** "belk.com" rather than "https://www.belk.com/", for the label. */
export function websiteLabel(site) {
  return String(site || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
}

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100

/** Whole days from one YYYY-MM-DD (or ISO) to another. */
export function daysBetween(from, to) {
  const a = new Date(`${String(from).slice(0, 10)}T00:00:00`)
  const b = new Date(`${String(to).slice(0, 10)}T00:00:00`)
  return Math.round((b - a) / 86400000)
}

/**
 * The at-a-glance numbers for one client over the last 30 days.
 *
 * Meta from ad_daily, Google from google_campaign_daily, added together only
 * here where the question is "how is this client doing", and each kept
 * alongside so the tile can say where the leads came from. The last new ad
 * is the later of what the CRM published and what the Meta sync first saw.
 */
export function clientGlance({ metaRows = [], googleRows = [], newestAdDate = '', publishedAt = '', today }) {
  const meta = { spend: 0, leads: 0 }
  for (const r of metaRows) {
    meta.spend += Number(r.spend || 0)
    meta.leads += Number(r.leads || 0)
  }
  const google = { spend: 0, leads: 0 }
  for (const r of googleRows) {
    google.spend += Number(r.cost || 0)
    google.leads += Number(r.conversions || 0)
  }
  const spend = meta.spend + google.spend
  const leads = meta.leads + google.leads
  const lastAd = [String(newestAdDate || '').slice(0, 10), String(publishedAt || '').slice(0, 10)].filter(Boolean).sort().pop() || ''
  return {
    spend: r2(spend),
    leads: Math.round(leads * 10) / 10,
    cpl: leads > 0 ? r2(spend / leads) : 0,
    meta: { spend: r2(meta.spend), leads: meta.leads },
    google: { spend: r2(google.spend), leads: Math.round(google.leads * 10) / 10 },
    lastAd,
    daysSinceAd: lastAd && today ? daysBetween(lastAd, today) : null,
  }
}

/** Open, overdue and due-this-week, from the Tasks tab rows for this client. */
export function taskCounts(tasks = [], today) {
  const open = tasks.filter((t) => t.status !== 'done' && !t.parent_id)
  const overdue = open.filter((t) => t.due_date && t.due_date < today)
  return { open: open.length, overdue: overdue.length }
}
