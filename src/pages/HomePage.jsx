import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import FormSubmissionAlerts from '../components/FormSubmissionAlerts'
import {
  Badge,
  Card,
  Delta,
  IconAlert,
  IconCheckCircle,
  IconClipboard,
  IconClock,
  IconDeliverables,
  IconLaunch,
  IconPin,
  StatCard,
} from '../components/ui'
import {
  calcMRR,
  fetchDashboardData,
  formatDate,
  getMonday,
  isOverdue,
  money,
  today,
} from '../lib/queries'

/**
 * A pile of things that need doing, of one kind.
 *
 * These were whole cards tinted red or amber or blue, six of them at once,
 * which is a wall of colour that stops meaning urgency. The tint is now a
 * single bar down the left edge and a coloured icon: enough to sort them at a
 * glance, quiet enough that six of them still look like a list.
 */
const GROUP_TONES = {
  danger: { rail: 'bg-red-500', icon: 'text-red-600', badge: 'danger' },
  warning: { rail: 'bg-amber-500', icon: 'text-amber-600', badge: 'warning' },
  info: { rail: 'bg-blue-500', icon: 'text-blue-600', badge: 'info' },
}

function ActionGroup({ Icon, title, tone, items }) {
  if (items.length === 0) return null
  const t = GROUP_TONES[tone] || GROUP_TONES.info

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex">
        <span className={`w-1 flex-shrink-0 ${t.rail}`} aria-hidden="true" />
        <div className="min-w-0 flex-1 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Icon className={`h-[18px] w-[18px] ${t.icon}`} />
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h3>
            <Badge tone={t.badge}>{items.length}</Badge>
          </div>

          <ul className="space-y-1">
            {items.slice(0, 6).map((item) => (
              <li key={item.key}>
                <Link
                  to={item.to}
                  className="group flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 -mx-2 transition hover:bg-slate-50"
                >
                  <span className="truncate text-sm text-slate-700 group-hover:text-slate-900">
                    {item.label}
                  </span>
                  <span className="flex-shrink-0 text-[11px] tabular-nums text-slate-400">
                    {item.meta}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {items.length > 6 && (
            <p className="pt-2 text-[11px] text-slate-400">+ {items.length - 6} more</p>
          )}
        </div>
      </div>
    </Card>
  )
}

/**
 * Last week's totals, out of the KPI history the dashboard was already
 * fetching and then throwing away.
 *
 * fetchDashboardData has always asked for two weeks and HomePage destructured
 * only three of the four things it returned, so every number on this page was
 * a figure with nothing to compare it to. "$4,200 spent" says nothing on its
 * own; "$4,200, down 12%" is the whole point of looking.
 */
function lastWeekTotals(kpis) {
  const lastMonday = formatDate(getMonday(new Date(Date.now() - 7 * 86400000)))
  const rows = (kpis || []).filter((k) => k.week_of === lastMonday)

  const spend = rows.reduce((t, k) => t + (k.ad_spend || 0), 0)
  const leads = rows.reduce((t, k) => t + (k.leads || 0), 0)
  return { spend, leads, costPerLead: leads > 0 ? spend / leads : 0 }
}

export default function HomePage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchDashboardData()
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])

  if (error) {
    return (
      <Layout title="Dashboard">
        <Card tone="danger" className="text-red-700">
          Error: {error}
        </Card>
      </Layout>
    )
  }

  if (!data) {
    return (
      <Layout title="Dashboard">
        <p className="text-slate-500">Loading...</p>
      </Layout>
    )
  }

  const { clients, payments, deliverables, kpis } = data
  const now = today()

  const live = clients.filter((c) => !c.archived)
  const metaLive = live.filter((c) => c.meta_ads_active)
  const metaNotYet = live.filter((c) => !c.meta_ads_active)
  const lsaNotYet = live.filter((c) => !c.lsa_active)

  const { mrr, count: billingCount } = calcMRR(clients, payments)

  // All-time, matching the Payments tab — a month-scoped total read $0 on the
  // 1st even when money had just come in.
  const paidPayments = payments.filter((p) => p.status === 'paid')
  const totalCollected = paidPayments.reduce((sum, p) => sum + p.amount, 0)

  const overduePayments = payments.filter(isOverdue)
  const overdueTotal = overduePayments.reduce((s, p) => s + p.amount, 0)

  const leadsThisWeek = clients.reduce((sum, c) => sum + c.thisWeekTotalLeads, 0)
  const spendThisWeek = clients.reduce((sum, c) => sum + c.thisWeekTotalSpend, 0)
  const cplThisWeek = leadsThisWeek > 0 ? spendThisWeek / leadsThisWeek : 0
  const prev = lastWeekTotals(kpis)

  const inSevenDays = new Date()
  inSevenDays.setDate(inSevenDays.getDate() + 7)
  const weekOut = formatDate(inSevenDays)

  const openDeliverables = deliverables.filter((d) => d.status !== 'done')
  const lateDeliverables = openDeliverables.filter((d) => d.due_date && d.due_date < now)
  const dueSoon = openDeliverables.filter(
    (d) => d.due_date && d.due_date >= now && d.due_date <= weekOut
  )

  const missingKPIs = clients.filter((c) => c.hasMissingKPIs)

  const actionGroups = [
    {
      Icon: IconAlert,
      title: 'Overdue payments',
      tone: 'danger',
      items: overduePayments.map((p) => ({
        key: p.id,
        to: '/payments',
        label: `${p.clients?.name || 'Unknown'} — ${money(p.amount)}`,
        meta: `due ${p.due_date}`,
      })),
    },
    {
      Icon: IconClock,
      title: 'Deliverables past due',
      tone: 'danger',
      items: lateDeliverables.map((d) => ({
        key: d.id,
        to: '/deliverables',
        label: `${d.clients?.name || 'Unknown'} — ${d.title}`,
        meta: `due ${d.due_date}`,
      })),
    },
    {
      Icon: IconClipboard,
      title: 'KPIs not logged this week',
      tone: 'warning',
      items: missingKPIs.map((c) => ({
        key: c.id,
        to: `/client/${c.id}`,
        label: c.name,
        meta: 'log KPIs',
      })),
    },
    {
      Icon: IconDeliverables,
      title: 'Due in the next 7 days',
      tone: 'info',
      items: dueSoon.map((d) => ({
        key: d.id,
        to: '/deliverables',
        label: `${d.clients?.name || 'Unknown'} — ${d.title}`,
        meta: `due ${d.due_date}`,
      })),
    },
    {
      Icon: IconLaunch,
      title: 'Meta not live yet',
      tone: 'info',
      items: metaNotYet.map((c) => ({
        key: c.id,
        to: `/client/${c.id}`,
        label: c.name,
        meta: `added ${c.date_added}`,
      })),
    },
    {
      Icon: IconPin,
      title: 'LSA not live yet',
      tone: 'info',
      items: lsaNotYet.map((c) => ({
        key: c.id,
        to: `/client/${c.id}`,
        label: c.name,
        meta: 'needs setup',
      })),
    },
  ]

  const nothingToDo = actionGroups.every((g) => g.items.length === 0)

  return (
    <Layout
      title="Dashboard"
      subtitle={new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })}
    >
      {/* Above the stats: a client waiting on us is more urgent than a number
          that has not moved since yesterday. Renders nothing when nothing is
          unread, so it costs no space on a quiet day. */}
      <div className="mb-6 empty:mb-0 md:mb-8">
        <FormSubmissionAlerts />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:mb-8 md:gap-4 lg:grid-cols-4">
        <StatCard label="Clients" value={live.length} sub={`${metaLive.length} with Meta live`} />
        <StatCard
          label="MRR"
          value={money(mrr)}
          sub={`${billingCount} ${billingCount === 1 ? 'client' : 'clients'} billing`}
        />
        <StatCard
          label="Collected"
          value={money(totalCollected)}
          sub={`${paidPayments.length} ${paidPayments.length === 1 ? 'payment' : 'payments'} all time`}
        />
        <StatCard
          label="Overdue"
          value={money(overdueTotal)}
          sub={`${overduePayments.length} ${overduePayments.length === 1 ? 'payment' : 'payments'}`}
          alert={overduePayments.length > 0}
        />
      </div>

      {/* The performance strip. Every number carries last week beside it, which
          is the difference between a dashboard you read and one you glance at
          and learn nothing from. */}
      <Card className="mb-6 md:mb-8" padding="lg">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          This week across all clients
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div className="min-w-0">
            <p className="text-xl font-semibold tabular-nums tracking-tight text-slate-900 md:text-3xl">
              {money(spendThisWeek)}
            </p>
            <p className="text-xs text-slate-500">Ad spend</p>
            {/* Spend going either way is neither good nor bad on its own -- it
                is the budget doing what it was told. Grey, deliberately. */}
            <Delta current={spendThisWeek} previous={prev.spend} className="mt-1" />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-semibold tabular-nums tracking-tight text-slate-900 md:text-3xl">
              {leadsThisWeek}
            </p>
            <p className="text-xs text-slate-500">Leads</p>
            <Delta
              current={leadsThisWeek}
              previous={prev.leads}
              goodWhen="up"
              className="mt-1"
            />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-semibold tabular-nums tracking-tight text-slate-900 md:text-3xl">
              {cplThisWeek > 0 ? `$${cplThisWeek.toFixed(2)}` : '—'}
            </p>
            <p className="text-xs text-slate-500">Cost per lead</p>
            <Delta
              current={cplThisWeek}
              previous={prev.costPerLead}
              goodWhen="down"
              className="mt-1"
            />
          </div>
        </div>
      </Card>

      <h2 className="mb-3 text-lg font-semibold tracking-tight text-slate-900">What to do today</h2>

      {nothingToDo ? (
        <Card padding="lg" className="text-center">
          <IconCheckCircle className="mx-auto h-8 w-8 text-green-600" />
          <p className="mt-2 font-medium text-slate-900">All caught up</p>
          <p className="mt-1 text-sm text-slate-500">
            No overdue payments, late deliverables, or missing KPIs.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
          {actionGroups.map((group) => (
            <ActionGroup key={group.title} {...group} />
          ))}
        </div>
      )}
    </Layout>
  )
}
