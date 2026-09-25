import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import FormSubmissionAlerts from '../components/FormSubmissionAlerts'
import AdDeliveryAlerts from '../components/AdDeliveryAlerts'
import AdDoctorAlerts from '../components/AdDoctorAlerts'
import LaunchReadyAlerts from '../components/LaunchReadyAlerts'
import NextUpDigest from '../components/NextUpDigest'
import QuickCopyPanel from '../components/QuickCopyPanel'
import HomeTiles from '../components/HomeTiles'
import { adsReady } from '../lib/adsReady'
import {
  Badge,
  Card,
  Delta,
  IconCheckCircle,
  IconClipboard,
  IconClock,
  IconDeliverables,
  StatCard,
} from '../components/ui'
import {
  fetchDashboardData,
  formatDate,
  getMonday,
  money,
  today,
} from '../lib/queries'

/**
 * One channel's coverage: how many clients have it live, out of how many it
 * applies to.
 *
 * The bar exists because "5 of 10" and "9 of 10" read identically at a glance
 * and this row is meant to be glanceable. Green only at full coverage, so a
 * complete channel is visibly finished and the rest stay quiet rather than
 * turning the row into a traffic light.
 */
function Coverage({ label, done, total, empty }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const complete = total > 0 && done === total
  return (
    <div className="min-w-0">
      <p className="text-xl font-semibold tabular-nums tracking-tight text-slate-900 md:text-2xl">
        {total > 0 ? (
          <>
            {done}
            <span className="text-base font-normal text-slate-400"> / {total}</span>
          </>
        ) : (
          <span className="text-base font-normal text-slate-400">—</span>
        )}
      </p>
      <p className="truncate text-xs text-slate-500">{total > 0 ? label : empty || label}</p>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${complete ? 'bg-green-500' : 'bg-slate-700'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/**
 * A pile of things that need doing, of one kind.
 *
 * These were whole cards tinted red or amber or blue, six of them at once,
 * which is a wall of colour that stops meaning urgency. The tint is now a
 * single bar down the left edge and a coloured icon: enough to sort them at a
 * glance, quiet enough that six of them still look like a list.
 */
const GROUP_TONES = {
  // Green is for the one group that is an opportunity rather than a problem:
  // work that is unblocked and waiting. Among four shades of warning it reads
  // as "start here", which is exactly its job.
  success: { rail: 'bg-emerald-500', icon: 'text-emerald-600', badge: 'success' },
  danger: { rail: 'bg-red-500', icon: 'text-red-600', badge: 'danger' },
  warning: { rail: 'bg-amber-500', icon: 'text-amber-600', badge: 'warning' },
  info: { rail: 'bg-blue-500', icon: 'text-blue-600', badge: 'info' },
}

// How many of a group show before it folds. Six keeps a card the height of a
// card; the rest are one click away.
const VISIBLE = 6

function ActionGroup({ Icon, title, tone, items }) {
  // Before the early return, not after. A group that is empty today and has
  // something in it tomorrow is the same component instance in the same slot,
  // and a hook that only runs on some of those renders is a crash.
  const [expanded, setExpanded] = useState(false)

  if (items.length === 0) return null
  const t = GROUP_TONES[tone] || GROUP_TONES.info
  const hidden = items.length - VISIBLE
  const shown = expanded ? items : items.slice(0, VISIBLE)

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
            {shown.map((item) => (
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

          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 -mx-2 w-[calc(100%+1rem)] rounded-lg px-2 py-1.5 text-left text-[11px] font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
            >
              {expanded ? 'Show fewer' : `+ ${hidden} more`}
            </button>
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

  const { clients, deliverables, kpis, delivery } = data
  const now = today()

  const live = clients.filter((c) => !c.archived)
  const metaLive = live.filter((c) => c.meta_ads_active)

  // Meta connected, ads off, GHL live or not on the plan: nothing in the way
  // but us. Feeds the launch-ready notice; everything else about "where does
  // each client stand" now comes from the pipeline digest below it.
  const forAds = adsReady({ clients: live, deliverables })

  const lsaLive = live.filter((c) => c.lsa_active)
  const gbpDone = live.filter((c) => c.gbp_optimized)
  const ghlOnPlan = live.filter((c) => c.ghl_plan)
  const ghlLive = ghlOnPlan.filter((c) => c.ghl_active)

  // How many arrived this month, which is the onboarding load. The `status`
  // column would be the obvious thing to break clients down by, but every
  // client currently sits at 'onboarding' — it is not maintained, so counting
  // it would say something untrue with great confidence.
  const thisMonth = now.slice(0, 7)
  const addedThisMonth = live.filter((c) => String(c.date_added || '').startsWith(thisMonth))

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

  // Dated work only. Where each client stands, and whose move it is, lives in
  // the pipeline digest above; these are the things with a date on them.
  const actionGroups = [
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
      {/* THE HOME SCREEN. Every part of the CRM as a tile, first, so the
          phone has somewhere to go that is not a strip of six icons, and a
          new teammate sees the whole app at a glance. */}
      <HomeTiles
        counts={{
          '/clients': `${live.length} live`,
          '/deliverables': openDeliverables.length > 0 ? `${openDeliverables.length} open` : 'all done',
        }}
      />

      {/* A client whose ads have stopped is losing money right now, and it
          is the one thing here nobody would otherwise notice. Renders nothing
          when all is well. */}
      <AdDeliveryAlerts clients={clients} delivery={delivery} todayDate={now} />

      {/* Then a client waiting on us, which is more urgent than a number that
          has not moved since yesterday. Also renders nothing when there is
          nothing unread, so it costs no space on a quiet day. */}
      <div className="mb-6 empty:mb-0 md:mb-8">
        <FormSubmissionAlerts />
      </div>

      {/* Then the Ad Doctor Agent's kill and scale verdicts across every
          client: an ad burning budget with no leads, or a winner starved of
          it. Same rules as each client's page; renders nothing on a quiet day. */}
      <AdDoctorAlerts />

      {/* A client with Meta connected, ads off, and GoHighLevel live or not
          on their plan has nothing in the way but us. Renders nothing when
          there is nobody like that. */}
      <LaunchReadyAlerts ready={forAds.ready} blocked={forAds.blocked} />

      {/* Every client's next move, ours and theirs, from the same pipeline
          the client page and the Deliverables board show. */}
      <NextUpDigest />

      {/* The state of the book of work. Money lives on the Payments tab; this
          page answers "where does every client stand", which is a different
          question and the one asked far more often. */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:mb-8 md:gap-4 lg:grid-cols-3">
        <StatCard
          label="Clients"
          value={live.length}
          sub={
            addedThisMonth.length > 0
              ? `${addedThisMonth.length} added this month`
              : 'none added this month'
          }
        />
        <StatCard
          label="Open work"
          value={openDeliverables.length}
          sub={
            lateDeliverables.length > 0
              ? `${lateDeliverables.length} past due`
              : `${dueSoon.length} due in 7 days`
          }
          alert={lateDeliverables.length > 0}
        />
        {/* No alert flag: unlogged KPIs are a routine mid-week state and the
            names are listed below anyway. A red card should mean something is
            wrong, and it only reads that way while it is the only red one. */}
        <StatCard
          label="KPIs logged"
          value={`${live.length - missingKPIs.length} of ${live.length}`}
          sub={missingKPIs.length > 0 ? `${missingKPIs.length} still to log` : 'all in for this week'}
        />
      </div>

      {/* The IDs, emails and access messages the team pastes into other
          people's screens all day. One click each; same sources as the
          channel panels, so nothing here can say something different. */}
      <QuickCopyPanel />

      {/* Channel coverage. Every one of these has a matching list further down
          naming exactly who is missing, so the number is a summary of work that
          is already broken out rather than a dead end. */}
      <Card className="mb-6 md:mb-8" padding="lg">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Channels live
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Coverage label="Meta ads" done={metaLive.length} total={live.length} />
          <Coverage label="Google LSA" done={lsaLive.length} total={live.length} />
          <Coverage label="Google Business" done={gbpDone.length} total={live.length} />
          {/* Out of the clients who bought GHL, not out of everyone — only some
              are on the plan, so the whole client count is the wrong
              denominator and would read as permanent failure. */}
          <Coverage label="GHL" done={ghlLive.length} total={ghlOnPlan.length} empty="nobody on the plan" />
        </div>
      </Card>

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
            No late deliverables, no missing KPIs, every channel live.
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
