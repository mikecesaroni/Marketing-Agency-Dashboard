import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchClientsWithKPIs } from '../lib/queries'
import Modal from '../components/Modal'
import AddClientForm from '../components/AddClientForm'

export default function DashboardPage() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddClientModal, setShowAddClientModal] = useState(false)

  useEffect(() => {
    loadClients()
  }, [])

  const loadClients = async () => {
    try {
      const data = await fetchClientsWithKPIs()
      setClients(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleClientAdded = () => {
    loadClients()
    setShowAddClientModal(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-600">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            Error: {error}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-3 md:p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-3 mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Clients</h1>
          <button
            onClick={() => setShowAddClientModal(true)}
            className="w-full md:w-auto px-4 py-3 md:py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition touch-none"
          >
            + New Client
          </button>
        </div>

        {clients.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
            <p className="text-slate-500">No clients yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl md:rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto -mx-3 md:mx-0 px-3 md:px-0">
              <table className="w-full text-sm md:text-base">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">
                      Industry
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">
                      Market
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                      Meta Budget/day
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                      LSA Budget/day
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                      This Week Spend
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                      This Week Leads
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                      Cost/Lead
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr
                      key={client.id}
                      className={`border-b border-slate-200 hover:bg-slate-50 transition ${
                        client.hasMissingKPIs ? 'bg-yellow-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3 text-sm font-medium">
                        <Link
                          to={`/client/${client.id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {client.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {client.industry || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {client.market || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                            client.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : client.status === 'paused'
                                ? 'bg-yellow-100 text-yellow-800'
                                : client.status === 'onboarding'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {client.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">
                        ${client.meta_budget_per_day ? client.meta_budget_per_day.toFixed(2) : '0'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">
                        ${client.lsa_budget_per_day ? client.lsa_budget_per_day.toFixed(2) : '0'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">
                        ${client.thisWeekTotalSpend.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">
                        {client.thisWeekTotalLeads}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">
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
        )}

        <div className="mt-6 text-xs text-slate-500">
          <p>💡 Rows highlighted in yellow are missing this week's KPI data.</p>
        </div>

        <Modal
          isOpen={showAddClientModal}
          onClose={() => setShowAddClientModal(false)}
          title="Add New Client"
        >
          <AddClientForm
            onSuccess={handleClientAdded}
            onClose={() => setShowAddClientModal(false)}
          />
        </Modal>
      </div>
    </div>
  )
}
