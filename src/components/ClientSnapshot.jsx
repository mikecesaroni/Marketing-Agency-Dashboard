import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { copyText } from '../lib/intakeSummary'
import { money, today as todayIso } from '../lib/queries'
import { isPausedPayment } from '../lib/billing'
import { daysAgo } from '../lib/dailySeries'
import { clientContact, clientGlance, taskCounts, telHref, websiteHref, websiteLabel } from '../lib/clientGlance'
import { Card } from './ui'
import { cached, keys } from '../lib/pageCache'

/**
 * The top of a client page: how to reach them, and how they are doing.
 *
 * Phone, email and website first, one tap each (and a copy button beside the
 * phone and email), from the intake with the GHL form as the fallback. Under
 * them, five numbers pulled from the rest of the CRM, each a link to where
 * the detail lives: leads and spend over 30 days across Meta and Google, the
 * last new ad, open tasks, and (admin only) the money.
 */
export default function ClientSnapshot({ client, intake, tasks = [], showMoney = false }) {
  const [ghl, setGhl] = useState(null)
  const [glance, setGlance] = useState(null)
  const [money30, setMoney30] = useState(null)

  useEffect(() => {
    let cancelled = false
    const since = daysAgo(29)
    const apply = ([g, meta, google, newest, published, pay]) => {
      if (cancelled) return
      setGhl(g?.data || null)
      setGlance(
        clientGlance({
          metaRows: meta?.data || [],
          googleRows: google?.data || [],
          newestAdDate: newest?.data?.first_seen || '',
          publishedAt: published?.data?.[0]?.created_at || '',
          today: todayIso(),
        })
      )
      if (pay?.data) {
        const owed = pay.data.filter((p) => !isPausedPayment(p, client))
        const overdue = owed.filter((p) => p.due_date < todayIso())
        setMoney30({ next: owed.find((p) => p.due_date >= todayIso()) || null, overdue })
      }
    }
    // Cached per client (and whether money is included), so the strip paints
    // at once on a return visit and refreshes behind.
    cached(`${keys.clientSnapshot(client.id)}:${showMoney ? 'money' : 'plain'}`, () => Promise.all([
      // Only the reachable-by fields: this table also holds an EIN.
      supabase.from('ghl_setup').select('main_phone, support_email, website_url, business_city, authorized_rep_name').eq('client_id', client.id).maybeSingle(),
      supabase.from('ad_daily').select('spend, leads').eq('client_id', client.id).gte('date', since),
      supabase.from('google_campaign_daily').select('cost, conversions').eq('client_id', client.id).gte('date', since),
      supabase.from('client_newest_ad').select('first_seen').eq('client_id', client.id).maybeSingle(),
      supabase.from('published_ads').select('created_at').eq('client_id', client.id).order('created_at', { ascending: false }).limit(1),
      showMoney
        ? supabase.from('payments').select('id, payment_type, status, due_date, amount').eq('client_id', client.id).neq('status', 'paid').order('due_date')
        : Promise.resolve({ data: null }),
    ]).then((parts) => parts.map((r) => ({ data: r?.data ?? null }))), apply).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [client, showMoney])

  const contact = clientContact({ client, intake, ghl })
  const counts = taskCounts(tasks, todayIso())
  const g = glance

  return (
    <Card className="mb-6 md:mb-8" padding="none">
      {/* HOW TO REACH THEM */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-100 px-4 py-3 md:px-5">
        {contact.owner && (
          <span className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{contact.owner}</span>
            {contact.area && <span className="text-slate-400"> · {contact.area}</span>}
          </span>
        )}
        {!contact.owner && contact.area && <span className="text-sm text-slate-500">{contact.area}</span>}
        <ContactItem
          icon="📞"
          label={contact.phone}
          href={telHref(contact.phone)}
          copy={contact.phone}
          empty="No phone on file"
        />
        <ContactItem icon="✉️" label={contact.email} href={contact.email ? `mailto:${contact.email}` : ''} copy={contact.email} empty="No email on file" />
        <ContactItem icon="🌐" label={websiteLabel(contact.website)} href={websiteHref(contact.website)} external empty="No website on file" />
      </div>

      {/* HOW THEY ARE DOING */}
      <div className="grid grid-cols-2 divide-slate-100 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
        <Stat
          href="#ad-performance"
          label="Leads · 30 days"
          value={g ? g.leads : '…'}
          sub={g ? (g.leads ? `${g.cpl ? `$${g.cpl.toFixed(2)} each · ` : ''}Meta ${g.meta.leads}${g.google.leads ? ` · Google ${g.google.leads}` : ''}` : 'No leads in 30 days') : ''}
        />
        <Stat
          href="#ad-performance"
          label="Ad spend · 30 days"
          value={g ? money(g.spend) : '…'}
          sub={g ? (g.spend ? `Meta ${money(g.meta.spend)}${g.google.spend ? ` · Google ${money(g.google.spend)}` : ''}` : 'Nothing spent') : ''}
        />
        <Stat
          href="#ad-performance"
          label="Last new ad"
          value={!g ? '…' : g.daysSinceAd == null ? '—' : g.daysSinceAd === 0 ? 'Today' : `${g.daysSinceAd}d ago`}
          sub={!g ? '' : g.daysSinceAd == null ? 'No ad yet' : g.daysSinceAd >= 10 && !client.paused_at ? '10+ days, time for a new one' : g.lastAd}
          warn={g && g.daysSinceAd != null && g.daysSinceAd >= 10 && !client.paused_at}
        />
        <Stat
          href="#tasks"
          label="Open tasks"
          value={counts.open}
          sub={counts.overdue ? `${counts.overdue} overdue` : counts.open ? 'None overdue' : 'Nothing open'}
          warn={counts.overdue > 0}
        />
        {showMoney ? (
          <Stat
            href="#payments"
            label="Monthly"
            value={client.monthly_fee ? money(client.monthly_fee) : '—'}
            sub={
              client.paused_at
                ? 'On pause'
                : money30?.overdue?.length
                  ? `${money30.overdue.length} overdue`
                  : money30?.next
                    ? `Next ${money30.next.due_date}`
                    : 'Nothing scheduled'
            }
            warn={Boolean(money30?.overdue?.length)}
          />
        ) : (
          <Stat label="Area" value={contact.area || '—'} sub={client.industry || ''} />
        )}
      </div>
    </Card>
  )
}

function ContactItem({ icon, label, href, copy, external, empty }) {
  const [copied, setCopied] = useState(false)
  if (!label) return <span className="text-sm text-slate-400">{empty}</span>
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm">
      <span aria-hidden="true">{icon}</span>
      {href ? (
        <a
          href={href}
          {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
          className="truncate font-medium text-blue-700 hover:text-blue-900 hover:underline"
        >
          {label}
        </a>
      ) : (
        <span className="truncate font-medium text-slate-800">{label}</span>
      )}
      {copy && (
        <button
          type="button"
          onClick={async () => {
            const ok = await copyText(copy)
            setCopied(ok)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="rounded px-1 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label={`Copy ${label}`}
        >
          {copied ? '✓' : 'copy'}
        </button>
      )}
    </span>
  )
}

function Stat({ label, value, sub, href, warn }) {
  const body = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold text-slate-900">{value}</p>
      {sub && <p className={`mt-0.5 truncate text-xs ${warn ? 'font-medium text-amber-700' : 'text-slate-500'}`}>{sub}</p>}
    </>
  )
  const cls = 'block min-w-0 px-4 py-3 md:px-5'
  return href ? (
    <a href={href} className={`${cls} transition hover:bg-slate-50`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  )
}
