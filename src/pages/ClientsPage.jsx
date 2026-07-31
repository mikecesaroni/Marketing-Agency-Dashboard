import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import AddClientForm from '../components/AddClientForm'
import { fetchClientsWithKPIs, money } from '../lib/queries'

const STATUSES = ['all', 'active', 'onboarding', 'paused', 'churned']

const STATUS_STYLES = {
  active: 'bg-green-100 text-green-800',
  onboarding: 'bg-blue-100 text-blue-800',
  paused: 'bg-amber-100 text-amber-800',
  churned: 'bg-slate-200 text-slate-700',
}

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${
        STATUS_STYLES[status] || 'bg-slate-100 text-slate-700'
      }`}
    >
      {status}
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
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (!term) return true
      return [c.name, c.industry, c.market].some((f) => f?.toLowerCase().includes(term))
    })
  }, [clients, search, statusFilter])

  const addButton = (
    <button
      onClick={() => setShowAddModal(true)}
      className="w-full md:w-auto px-4 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition"
    >
      + New Client
    </button>
  )

  return (
    <Layout
      title="Clients"
      subtitle={`${clients.length} total`}
      actions={addButton}
    >
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 mb-4">
          Error: {error}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, industry, or market..."
          className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <div className="flex gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-sm font-medium capitalize whitespace-nowrap transition ${
                statusFilter === s
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-slate-500">
            {clients.length === 0
              ? 'No clients yet. Create one to get started.'
              : 'No clients match this search.'}
          </p>
        </div>
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
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-semibold text-slate-900">{client.name}</p>
                  <StatusBadge status={client.status} />
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  {[client.industry, client.market].filter(Boolean).join(' · ') || 'No details yet'}
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
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-900">
                    <th className="px-4 py-3 text-left font-semibold">Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Industry</th>
                    <th className="px-4 py-3 text-left font-semibold">Market</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Meta $/day</th>
                    <th className="px-4 py-3 text-right font-semibold">LSA $/day</th>
                    <th className="px-4 py-3 text-right font-semibold">Wk Spend</th>
                    <th className="px-4 py-3 text-right font-semibold">Wk Leads</th>
                    <th className="px-4 py-3 text-right font-semibold">Cost/Lead</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client) => (
                    <tr
                      key={client.id}
                      className={`border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition ${
                        client.hasMissingKPIs ? 'bg-amber-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/client/${client.id}`}
                          className="font-medium text-blue-600 hover:text-blue-800"
                        >
                          {client.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{client.industry || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{client.market || '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={client.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {money(client.meta_budget_per_day)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {money(client.lsa_budget_per_day)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {money(client.thisWeekTotalSpend)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {client.thisWeekTotalLeads}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {client.thisWeekCostPerLead > 0
                          ? `$${client.thisWeekCostPerLead.toFixed(2)}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="New Client">
        <AddClientForm onSuccess={loadClients} onClose={() => setShowAddModal(false)} />
      </Modal>
    </Layout>
  )
}
