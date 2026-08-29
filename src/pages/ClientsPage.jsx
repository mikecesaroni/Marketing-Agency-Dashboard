import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import AddClientForm from '../components/AddClientForm'
import { fetchClientsWithKPIs, money } from '../lib/queries'
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

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'meta-live', label: 'Meta live' },
  { key: 'meta-not', label: 'Meta not yet' },
  { key: 'lsa-live', label: 'LSA optimized' },
  { key: 'lsa-not', label: 'LSA not yet' },
  { key: 'gbp-live', label: 'GBP optimized' },
  { key: 'gbp-not', label: 'GBP not yet' },
  { key: 'archived', label: 'Archived' },
]

function LiveBadge({ live, label }) {
  return (
    <Badge tone={live ? 'success' : 'dim'} className="whitespace-nowrap">
      {live ? '● ' : '○ '}
      {label}
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

function ChannelBadges({ client }) {
  return (
    <span className="inline-flex gap-1.5">
      <LiveBadge live={client.meta_ads_active} label="Meta" />
      <LiveBadge live={client.lsa_active} label="LSA" />
      <LiveBadge live={client.gbp_optimized} label="GBP" />
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

  const loadClients = async () => {
    try {
      setClients(await fetchClientsWithKPIs())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return clients.filter((c) => {
      // Archived clients stay out of every view except their own, so a former
      // client can't quietly reappear in a list you act on.
      if (statusFilter === 'archived') {
        if (!c.archived) return false
      } else {
        if (c.archived) return false
        if (statusFilter === 'meta-live' && !c.meta_ads_active) return false
        if (statusFilter === 'meta-not' && c.meta_ads_active) return false
        if (statusFilter === 'lsa-live' && !c.lsa_active) return false
        if (statusFilter === 'lsa-not' && c.lsa_active) return false
        if (statusFilter === 'gbp-live' && !c.gbp_optimized) return false
        if (statusFilter === 'gbp-not' && c.gbp_optimized) return false
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
      subtitle={`${clients.length} total`}
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
