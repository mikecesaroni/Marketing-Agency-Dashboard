import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import AddClientForm from '../components/AddClientForm'
import { fetchClientsWithKPIs, money } from '../lib/queries'
import { cached, keys } from '../lib/pageCache'
import {
  Badge,
  Button,
  Card,
  Input,
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
} from '../components/ui'
import { TIER_BY_NUMBER, tierLabel, tierOf } from '../lib/clientTiers'
import { channelOf, channelStatus, missingChannel } from '../lib/channelStatus'
import { pageTitle, purposeMeta } from '../lib/landingPages'

const FILTERS = [
  { key: 'all', label: 'All' },
  // Meta and Google read through the package (src/lib/channelStatus.js):
  // "not yet" is a channel the package owes that is not live, so a
  // Maintenance client on Google is never "Meta not yet". Local Services
  // counts as Google live.
  { key: 'meta-live', label: 'Meta live' },
  { key: 'meta-not', label: 'Meta not yet' },
  { key: 'google-live', label: 'Google live' },
  { key: 'google-not', label: 'Google not yet' },
  { key: 'missing', label: 'Missing a channel' },
  { key: 'no-landing', label: 'No landing page' },
  // Two GHL filters rather than the live/not-yet pair the others use. "Not
  // live" is meaningless for an opt-in service -- most clients are not on it at
  // all -- so the useful questions are "who is on the plan" and "whose build is
  // outstanding".
  { key: 'ghl-plan', label: 'On GHL plan' },
  { key: 'ghl-todo', label: 'GHL to build' },
  { key: 'paused', label: 'Paused' },
  { key: 'archived', label: 'Archived' },
]

// One badge per channel the package owes (and any live channel outside it):
// ● live, ◐ connected but not live, ○ not connected, ⚠ Google refused us.
// So a Whole Chain client reads "● Meta live · ○ Google not connected" and
// a Maintenance client on Google reads "◐ Google connected" with no Meta
// badge at all ("see if a client is connected to Meta and Google, keeping
// in mind their tiers").
const CHANNEL_LOOK = {
  live: { tone: 'success', mark: '●', word: 'live' },
  connected: { tone: 'info', mark: '◐', word: 'connected' },
  refused: { tone: 'danger', mark: '⚠', word: 'access refused' },
  missing: { tone: 'dim', mark: '○', word: 'not connected' },
}

function ChannelBadge({ channel }) {
  const look = CHANNEL_LOOK[channel.state] || CHANNEL_LOOK.missing
  return (
    <Badge tone={look.tone} className={`whitespace-nowrap${channel.extra ? ' opacity-80' : ''}`} title={channel.detail} data-channel={channel.key} data-state={channel.state}>
      {look.mark} {channel.label} {look.word}
      {channel.extra ? '*' : ''}
    </Badge>
  )
}

/**
 * Where the ads send people: ● when a landing page is saved for the client
 * (hover lists them, with what each is for), ○ when none is. Saved under
 * Content → Landing pages, or on the client page.
 */
function LandingBadge({ pages = [] }) {
  const n = pages.length
  const title = n ? pages.map((p) => `${pageTitle(p)} (${purposeMeta(p.purpose).label})`).join('\n') : 'No landing page saved yet. Add one under Content → Landing pages.'
  return (
    <Badge tone={n ? 'success' : 'dim'} className="whitespace-nowrap" title={title} data-landing-pages={n}>
      {n ? `● Landing page${n > 1 ? ` ×${n}` : ''}` : '○ No landing page'}
    </Badge>
  )
}

const SETUP_FEE_STYLES = {
  paid: { label: '✓ Paid', tone: 'success' },
  partial: { label: 'Part paid', tone: 'info' },
  unpaid: { label: 'Unpaid', tone: 'warning' },
  overdue: { label: 'Overdue', tone: 'danger' },
}

function SetupFeeBadge({ status, amount, paidAmount }) {
  if (!status) return <span className="text-slate-400">—</span>

  const { label, tone } = SETUP_FEE_STYLES[status]
  // A split fee needs both numbers to mean anything — "Part paid · $2,500"
  // doesn't say how much of it actually landed.
  const detail =
    status === 'partial' ? `${money(paidAmount)} of ${money(amount)}` : amount ? money(amount) : ''

  return (
    <Badge tone={tone}>
      {label}
      {detail ? ` · ${detail}` : ''}
    </Badge>
  )
}

function MonthlySubBadge({ subscribed }) {
  return (
    <Badge tone={subscribed ? 'success' : 'dim'} className="whitespace-nowrap">
      {subscribed ? '✓ Subscribed' : 'Not yet'}
    </Badge>
  )
}

/** The package, from the column or guessed from the fee (amber when guessed). */
function TierBadge({ client }) {
  const { tier, guessed } = tierOf(client)
  if (!tier) return null
  return (
    <Badge tone={guessed ? 'warning' : 'info'} className="whitespace-nowrap" title={guessed ? 'Guessed from the monthly fee; confirm it on Client tiers' : TIER_BY_NUMBER[tier].name}>
      {tierLabel(tier)}
      {guessed ? '?' : ''}
    </Badge>
  )
}

// The package, the ad channels it owes, and the landing page. GHL and GBP
// came off this column 2026-10-29 ("get rid of the GHL and GBP in that
// section, but add in landing page"): GHL lives on the client page and the
// Ready to build list, GBP on the client page.
function ChannelBadges({ client }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <TierBadge client={client} />
      {channelStatus(client, { googleCampaigns: client.googleCampaigns }).map((ch) => (
        <ChannelBadge key={ch.key} channel={ch} />
      ))}
      <LandingBadge pages={client.landingPages} />
      {client.paused_at && (
        <Badge tone="warning" className="whitespace-nowrap" title="On pause: no ads alerts, no 10+ days flag">
          ⏸ Paused
        </Badge>
      )}
    </span>
  )
}

export default function ClientsPage() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    loadClients()
  }, [])

  // The last list shows at once and refreshes behind it, so coming back
  // from a client page does not start from a blank screen.
  const loadClients = async () => {
    try {
      await cached(keys.clients(), fetchClientsWithKPIs, (rows) => {
        setClients(rows)
        setLoading(false)
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const liveCount = useMemo(() => clients.filter((c) => !c.archived).length, [clients])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return clients.filter((c) => {
      // Archived clients stay out of every view except their own, so a former
      // client can't quietly reappear in a list you act on.
      if (statusFilter === 'archived') {
        if (!c.archived) return false
      } else {
        if (c.archived) return false
        if (statusFilter === 'paused' && !c.paused_at) return false
        // Through the package: "not yet" is an owed channel that is not live.
        const opts = { googleCampaigns: c.googleCampaigns }
        const meta = channelOf(c, 'meta', opts)
        const google = channelOf(c, 'google', opts)
        if (statusFilter === 'meta-live' && meta?.state !== 'live') return false
        if (statusFilter === 'meta-not' && !(meta && !meta.extra && meta.state !== 'live')) return false
        if (statusFilter === 'google-live' && google?.state !== 'live') return false
        if (statusFilter === 'google-not' && !(google && !google.extra && google.state !== 'live')) return false
        if (statusFilter === 'missing' && !missingChannel(c, opts)) return false
        if (statusFilter === 'no-landing' && (c.landingPages || []).length > 0) return false
        if (statusFilter === 'ghl-plan' && !c.ghl_plan) return false
        // Everything on the plan that is not yet live, whether it is blocked on
        // the client or sitting in our queue.
        if (statusFilter === 'ghl-todo' && !(c.ghl_plan && !c.ghl_active)) return false
      }
      if (!term) return true
      return [c.name, c.ownerName, c.industry, c.market].some((f) =>
        f?.toLowerCase().includes(term)
      )
    })
  }, [clients, search, statusFilter])

  const addButton = (
    <Button variant="dark" size="lg" onClick={() => setShowAddModal(true)} className="w-full md:w-auto">
      + New Client
    </Button>
  )

  return (
    <Layout
      title="Clients"
      // Live clients only. The archived ones are still in the list (they show
      // under their own filter), but a headcount that includes a former client
      // reads as one more paying account than there is.
      subtitle={`${liveCount} live`}
      actions={addButton}
    >
      {error && (
        <Card tone="danger" className="mb-4 text-red-700">
          Error: {error}
        </Card>
      )}

      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <Input
          type="search"
          size="lg"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search business, client, industry, or market..."
          className="flex-1"
        />
        <div className="flex gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              variant={statusFilter === f.key ? 'dark' : 'outline'}
              onClick={() => setStatusFilter(f.key)}
              className="whitespace-nowrap"
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <p className="text-slate-500">
            {clients.length === 0
              ? 'No clients yet. Create one to get started.'
              : 'No clients match this search.'}
          </p>
        </Card>
      ) : (
        <>
          {/* MOBILE CARDS */}
          <div className="md:hidden space-y-2">
            {filtered.map((client) => (
              <Link
                key={client.id}
                to={`/client/${client.id}`}
                className={`block rounded-xl border p-4 ${
                  client.hasMissingKPIs
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{client.name}</p>
                    {client.ownerName && (
                      <p className="text-xs text-slate-600">{client.ownerName}</p>
                    )}
                  </div>
                  <ChannelBadges client={client} />
                </div>
                <p className="text-xs text-slate-500 mb-2">
                  {[client.industry, client.market].filter(Boolean).join(' · ') ||
                    'No intake filled in yet'}
                </p>
                {client.setupFeeStatus && (
                  <p className="mb-1.5">
                    <span className="text-xs text-slate-500 mr-1.5">Setup fee:</span>
                    <SetupFeeBadge
                      status={client.setupFeeStatus}
                      amount={client.setupFeeAmount}
                      paidAmount={client.setupFeePaidAmount}
                    />
                  </p>
                )}
                <p className="mb-3">
                  <span className="text-xs text-slate-500 mr-1.5">Monthly:</span>
                  <MonthlySubBadge subscribed={client.monthlySubscribed} />
                </p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {money(client.thisWeekTotalSpend)}
                    </p>
                    <p className="text-xs text-slate-500">Spend</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{client.thisWeekTotalLeads}</p>
                    <p className="text-xs text-slate-500">Leads</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">
                      {client.thisWeekCostPerLead > 0
                        ? `$${client.thisWeekCostPerLead.toFixed(2)}`
                        : '—'}
                    </p>
                    <p className="text-xs text-slate-500">Cost/lead</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* DESKTOP TABLE */}
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <Th>Business</Th>
                  <Th>Client</Th>
                  <Th>Industry</Th>
                  <Th>Market</Th>
                  <Th>Channels</Th>
                  <Th>Setup Fee</Th>
                  <Th>Monthly Sub</Th>
                  <Th numeric>Meta $/day</Th>
                  <Th numeric>Wk Spend</Th>
                  <Th numeric>Wk Leads</Th>
                  <Th numeric>Cost/Lead</Th>
                </tr>
              </THead>
              <TBody>
                {filtered.map((client) => (
                  <Tr key={client.id} tone={client.hasMissingKPIs ? 'warning' : undefined}>
                    <Td>
                      <Link
                        to={`/client/${client.id}`}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        {client.name}
                      </Link>
                    </Td>
                    <Td muted>{client.ownerName || '—'}</Td>
                    <Td muted>{client.industry || '—'}</Td>
                    <Td muted>{client.market || '—'}</Td>
                    <Td>
                      <ChannelBadges client={client} />
                    </Td>
                    <Td>
                      <SetupFeeBadge
                        status={client.setupFeeStatus}
                        amount={client.setupFeeAmount}
                        paidAmount={client.setupFeePaidAmount}
                      />
                    </Td>
                    <Td>
                      <MonthlySubBadge subscribed={client.monthlySubscribed} />
                    </Td>
                    <Td numeric muted>
                      {money(client.meta_budget_per_day)}
                    </Td>
                    <Td numeric className="font-medium">
                      {money(client.thisWeekTotalSpend)}
                    </Td>
                    <Td numeric className="font-medium">
                      {client.thisWeekTotalLeads}
                    </Td>
                    <Td numeric className="font-medium">
                      {client.thisWeekCostPerLead > 0
                        ? `$${client.thisWeekCostPerLead.toFixed(2)}`
                        : '—'}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        </>
      )}

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="New Client">
        <AddClientForm onSuccess={loadClients} onClose={() => setShowAddModal(false)} />
      </Modal>
    </Layout>
  )
}
