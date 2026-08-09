import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { calcMRR, fetchDashboardData, formatDate, isOverdue, money, today } from '../lib/queries'

function StatCard({ label, value, sub, tone = 'slate' }) {
  const tones = {
    slate: 'bg-white border-slate-200',
    green: 'bg-green-50 border-green-200',
    blue: 'bg-blue-50 border-blue-200',
    red: 'bg-red-50 border-red-200',
  }
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

function ActionGroup({ icon, title, tone, items }) {
  if (items.length === 0) return null

  const tones = {
    red: 'border-red-200 bg-red-50',
    amber: 'border-amber-200 bg-amber-50',
    blue: 'border-blue-200 bg-blue-50',
  }

  return (
    <div className={`rounded-xl border ${tones[tone]} p-4`}>
      <p className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <span>{icon}</span>
        {title}
        <span className="text-xs font-normal text-slate-500">({items.length})</span>
      </p>
      <div className="space-y-1.5">
        {items.slice(0, 6).map((item) => (
          <Link
            key={item.key}
            to={item.to}
            className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2 border border-slate-200 hover:border-slate-300 transition"
          >
            <span className="text-sm text-slate-900 truncate">{item.label}</span>
            <span className="text-xs text-slate-500 flex-shrink-0">{item.meta}</span>
          </Link>
        ))}
        {items.length > 6 && (
          <p className="text-xs text-slate-500 pt-1">+ {items.length - 6} more</p>
        )}
      </div>
    </div>
  )
}

export default function HomePage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchDashboardData().then(setData).catch((err) => setError(err.message))
  }, [])

  if (error) {
    return (
      <Layout title="Dashboard">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          Error: {error}
        </div>
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

  const { clients, payments, deliverables } = data
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
  const leadsThisWeek = clients.reduce((sum, c) => sum + c.thisWeekTotalLeads, 0)
  const spendThisWeek = clients.reduce((sum, c) => sum + c.thisWeekTotalSpend, 0)

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
      icon: '🔴',
      title: 'Overdue payments',
      tone: 'red',
      items: overduePayments.map((p) => ({
        key: p.id,
        to: '/payments',
        label: `${p.clients?.name || 'Unknown'} — ${money(p.amount)}`,
        meta: `due ${p.due_date}`,
      })),
    },
    {
      icon: '⚠️',
      title: 'Deliverables past due',
      tone: 'red',
      items: lateDeliverables.map((d) => ({
        key: d.id,
        to: '/deliverables',
        label: `${d.clients?.name || 'Unknown'} — ${d.title}`,
        meta: `due ${d.due_date}`,
      })),
    },
    {
      icon: '📋',
      title: 'KPIs not logged this week',
      tone: 'amber',
      items: missingKPIs.map((c) => ({
        key: c.id,
        to: `/client/${c.id}`,
        label: c.name,
        meta: 'log KPIs',
      })),
    },
    {
      icon: '📦',
      title: 'Due in the next 7 days',
      tone: 'blue',
      items: dueSoon.map((d) => ({
        key: d.id,
        to: '/deliverables',
        label: `${d.clients?.name || 'Unknown'} — ${d.title}`,
        meta: `due ${d.due_date}`,
      })),
    },
    {
      icon: '🚀',
      title: 'Meta not live yet',
      tone: 'blue',
      items: metaNotYet.map((c) => ({
        key: c.id,
        to: `/client/${c.id}`,
        label: c.name,
        meta: `added ${c.date_added}`,
      })),
    },
    {
      icon: '📍',
      title: 'LSA not live yet',
      tone: 'blue',
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <StatCard
          label="Clients"
          value={live.length}
          sub={`${metaLive.length} with Meta live`}
        />
        <StatCard
          label="MRR"
          value={money(mrr)}
          sub={`${billingCount} ${billingCount === 1 ? 'client' : 'clients'} billing`}
          tone="blue"
        />
        <StatCard
          label="Collected"
          value={money(totalCollected)}
          sub={`${paidPayments.length} ${paidPayments.length === 1 ? 'payment' : 'payments'} all time`}
          tone="green"
        />
        <StatCard
          label="Overdue"
          value={money(overduePayments.reduce((s, p) => s + p.amount, 0))}
          sub={`${overduePayments.length} payments`}
          tone={overduePayments.length > 0 ? 'red' : 'slate'}
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 mb-6 md:mb-8">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
          This week across all clients
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xl md:text-2xl font-bold text-slate-900">{money(spendThisWeek)}</p>
            <p className="text-xs text-slate-500">Ad spend</p>
          </div>
          <div>
            <p className="text-xl md:text-2xl font-bold text-slate-900">{leadsThisWeek}</p>
            <p className="text-xs text-slate-500">Leads</p>
          </div>
          <div>
            <p className="text-xl md:text-2xl font-bold text-slate-900">
              {leadsThisWeek > 0 ? `$${(spendThisWeek / leadsThisWeek).toFixed(2)}` : '—'}
            </p>
            <p className="text-xs text-slate-500">Cost per lead</p>
          </div>
        </div>
      </div>

      <h2 className="text-lg font-bold text-slate-900 mb-3">What to do today</h2>

      {nothingToDo ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-3xl mb-2">✅</p>
          <p className="text-slate-900 font-medium">All caught up</p>
          <p className="text-sm text-slate-500 mt-1">
            No overdue payments, late deliverables, or missing KPIs.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3 md:gap-4">
          {actionGroups.map((group) => (
            <ActionGroup key={group.title} {...group} />
          ))}
        </div>
      )}
    </Layout>
  )
}
