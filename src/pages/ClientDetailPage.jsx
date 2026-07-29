import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Modal from '../components/Modal'
import EditClientForm from '../components/EditClientForm'
import OnboardingIntakeForm from '../components/OnboardingIntakeForm'
import LogKPIsForm from '../components/LogKPIsForm'
import AddWorkLogForm from '../components/AddWorkLogForm'
import AddCreativeForm from '../components/AddCreativeForm'

export default function ClientDetailPage() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [onboardingTasks, setOnboardingTasks] = useState([])
  const [weeklyKPIs, setWeeklyKPIs] = useState([])
  const [workLogs, setWorkLogs] = useState([])
  const [creativeLogs, setCreativeLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showEditModal, setShowEditModal] = useState(false)
  const [showIntakeModal, setShowIntakeModal] = useState(false)
  const [showKPIsModal, setShowKPIsModal] = useState(false)
  const [showWorkLogModal, setShowWorkLogModal] = useState(false)
  const [showCreativeModal, setShowCreativeModal] = useState(false)

  useEffect(() => {
    loadClientData()
  }, [clientId])

  const loadClientData = async () => {
    try {
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single()

      if (clientError) throw clientError

      const { data: tasksData, error: tasksError } = await supabase
        .from('onboarding_tasks')
        .select('*')
        .eq('client_id', clientId)
        .order('task_name')

      if (tasksError) throw tasksError

      const { data: kpisData, error: kpisError } = await supabase
        .from('weekly_kpis')
        .select('*')
        .eq('client_id', clientId)
        .order('week_of', { ascending: false })

      if (kpisError) throw kpisError

      const { data: logsData, error: logsError } = await supabase
        .from('weekly_work_log')
        .select('*')
        .eq('client_id', clientId)
        .order('week_of', { ascending: false })

      if (logsError) throw logsError

      const { data: creativesData, error: creativesError } = await supabase
        .from('creative_log')
        .select('*')
        .eq('client_id', clientId)
        .order('date', { ascending: false })

      if (creativesError) throw creativesError

      setClient(clientData)
      setOnboardingTasks(tasksData)
      setWeeklyKPIs(kpisData)
      setWorkLogs(logsData)
      setCreativeLogs(creativesData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleTask = async (taskId, currentDone) => {
    const { error } = await supabase
      .from('onboarding_tasks')
      .update({
        done: !currentDone,
        date_completed: !currentDone ? new Date().toISOString().split('T')[0] : null,
      })
      .eq('id', taskId)

    if (!error) {
      setOnboardingTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                done: !currentDone,
                date_completed: !currentDone
                  ? new Date().toISOString().split('T')[0]
                  : null,
              }
            : t
        )
      )
    }
  }

  const handleDataAdded = async (type) => {
    if (type === 'edit') {
      setShowEditModal(false)
    } else if (type === 'intake') {
      setShowIntakeModal(false)
    } else if (type === 'kpis') {
      setShowKPIsModal(false)
    } else if (type === 'worklog') {
      setShowWorkLogModal(false)
    } else if (type === 'creative') {
      setShowCreativeModal(false)
    }
    loadClientData()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-600">Loading...</div>
      </div>
    )
  }

  if (error || !client) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => navigate('/dashboard')}
            className="mb-4 px-4 py-2 bg-slate-200 text-slate-900 rounded-lg hover:bg-slate-300 transition"
          >
            ← Back
          </button>
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error || 'Client not found'}
          </div>
        </div>
      </div>
    )
  }

  const progressDone = onboardingTasks.filter((t) => t.done).length
  const progressTotal = onboardingTasks.length
  const progressPercent = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0

  return (
    <div className="min-h-screen bg-slate-50 p-3 md:p-4">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={() => navigate('/dashboard')}
          className="mb-4 px-3 md:px-4 py-2 md:py-2 bg-slate-200 text-slate-900 rounded-lg hover:bg-slate-300 transition text-sm md:text-base"
        >
          ← Back
        </button>

        <div className="mb-6 md:mb-8">
          <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-start mb-4">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{client.name}</h1>
            <div className="flex gap-2 flex-col md:flex-row w-full md:w-auto">
              <button
                onClick={() => setShowIntakeModal(true)}
                className="flex-1 md:flex-none px-3 md:px-4 py-3 md:py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition text-sm touch-none"
              >
                Onboarding
              </button>
              <button
                onClick={() => setShowEditModal(true)}
                className="flex-1 md:flex-none px-3 md:px-4 py-3 md:py-2 bg-slate-600 text-white rounded-lg font-medium hover:bg-slate-700 transition text-sm touch-none"
              >
                Edit Info
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
            <div>
              <p className="text-xs text-slate-500 uppercase font-medium">Industry</p>
              <p className="font-semibold text-slate-900 text-sm md:text-base">{client.industry || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-medium">Market</p>
              <p className="font-semibold text-slate-900 text-sm md:text-base">{client.market || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-medium">Status</p>
              <p className="font-semibold text-slate-900 capitalize text-sm md:text-base">{client.status}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-medium">Meta/day</p>
              <p className="font-semibold text-slate-900 text-sm md:text-base">
                ${client.meta_budget_per_day ? client.meta_budget_per_day.toFixed(2) : '0'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-medium">LSA/day</p>
              <p className="font-semibold text-slate-900 text-sm md:text-base">
                ${client.lsa_budget_per_day ? client.lsa_budget_per_day.toFixed(2) : '0'}
              </p>
            </div>
          </div>
        </div>

        {/* ONBOARDING CHECKLIST */}
        <div className="bg-white rounded-lg md:rounded-xl shadow-sm border border-slate-200 p-4 md:p-6 mb-6 md:mb-8">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Onboarding Checklist</h2>
          <div className="mb-4 flex items-center gap-2">
            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            <span className="text-sm font-semibold text-slate-600">
              {progressDone}/{progressTotal}
            </span>
          </div>
          <div className="space-y-2">
            {onboardingTasks.map((task) => (
              <label key={task.id} className="flex items-center gap-3 p-2 rounded hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={() => toggleTask(task.id, task.done)}
                  className="w-4 h-4 rounded"
                />
                <span className={task.done ? 'line-through text-slate-400' : 'text-slate-700'}>
                  {task.task_name}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* WEEKLY KPIs */}
        <div className="bg-white rounded-lg md:rounded-xl shadow-sm border border-slate-200 p-4 md:p-6 mb-6 md:mb-8">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-4">
            <h2 className="text-lg md:text-xl font-bold text-slate-900">Weekly KPI History</h2>
            <button
              onClick={() => setShowKPIsModal(true)}
              className="w-full md:w-auto px-3 py-2 md:py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition touch-none"
            >
              + Log KPIs
            </button>
          </div>
          {weeklyKPIs.length === 0 ? (
            <p className="text-slate-500">No KPI data logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-3 py-2 text-left font-semibold text-slate-900">Week Of</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-900">Channel</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-900">Spend</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-900">Leads</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-900">Cost/Lead</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-900">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyKPIs.map((kpi) => (
                    <tr key={kpi.id} className="border-b border-slate-200 hover:bg-slate-50">
                      <td className="px-3 py-2">{kpi.week_of}</td>
                      <td className="px-3 py-2">{kpi.channel}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        ${kpi.ad_spend.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{kpi.leads}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {kpi.leads > 0 ? `$${(kpi.ad_spend / kpi.leads).toFixed(2)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-600 text-xs">{kpi.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* WORK LOG */}
        <div className="bg-white rounded-lg md:rounded-xl shadow-sm border border-slate-200 p-4 md:p-6 mb-6 md:mb-8">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-4">
            <h2 className="text-lg md:text-xl font-bold text-slate-900">Weekly Work Log</h2>
            <button
              onClick={() => setShowWorkLogModal(true)}
              className="w-full md:w-auto px-3 py-2 md:py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition touch-none"
            >
              + Add Entry
            </button>
          </div>
          {workLogs.length === 0 ? (
            <p className="text-slate-500">No work log entries yet.</p>
          ) : (
            <div className="space-y-4">
              {workLogs.map((log) => (
                <div key={log.id} className="border-b border-slate-200 pb-4 last:border-b-0">
                  <p className="text-sm text-slate-500 mb-1">Week of {log.week_of}</p>
                  <p className="text-slate-700">{log.work_summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CREATIVE LOG */}
        <div className="bg-white rounded-lg md:rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-4">
            <h2 className="text-lg md:text-xl font-bold text-slate-900">Creative Log</h2>
            <button
              onClick={() => setShowCreativeModal(true)}
              className="w-full md:w-auto px-3 py-2 md:py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition touch-none"
            >
              + Add Entry
            </button>
          </div>
          {creativeLogs.length === 0 ? (
            <p className="text-slate-500">No creative entries yet.</p>
          ) : (
            <div className="space-y-4">
              {creativeLogs.map((creative) => (
                <div key={creative.id} className="border-b border-slate-200 pb-4 last:border-b-0">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm text-slate-500 mb-1">{creative.date}</p>
                      <p className="font-semibold text-slate-900">{creative.description}</p>
                    </div>
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                        creative.status === 'live'
                          ? 'bg-green-100 text-green-800'
                          : creative.status === 'in progress'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {creative.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MODALS */}
        <Modal
          isOpen={showIntakeModal}
          onClose={() => setShowIntakeModal(false)}
          title="Client Onboarding Intake"
        >
          <OnboardingIntakeForm
            client={client}
            onSuccess={() => handleDataAdded('intake')}
            onClose={() => setShowIntakeModal(false)}
          />
        </Modal>

        <Modal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          title="Edit Client Info"
        >
          <EditClientForm
            client={client}
            onSuccess={() => handleDataAdded('edit')}
            onClose={() => setShowEditModal(false)}
          />
        </Modal>

        <Modal
          isOpen={showKPIsModal}
          onClose={() => setShowKPIsModal(false)}
          title="Log Weekly KPIs"
        >
          <LogKPIsForm
            clientId={clientId}
            clientName={client.name}
            onSuccess={() => handleDataAdded('kpis')}
            onClose={() => setShowKPIsModal(false)}
          />
        </Modal>

        <Modal
          isOpen={showWorkLogModal}
          onClose={() => setShowWorkLogModal(false)}
          title="Add Work Log Entry"
        >
          <AddWorkLogForm
            clientId={clientId}
            clientName={client.name}
            onSuccess={() => handleDataAdded('worklog')}
            onClose={() => setShowWorkLogModal(false)}
          />
        </Modal>

        <Modal
          isOpen={showCreativeModal}
          onClose={() => setShowCreativeModal(false)}
          title="Add Creative Entry"
        >
          <AddCreativeForm
            clientId={clientId}
            clientName={client.name}
            onSuccess={() => handleDataAdded('creative')}
            onClose={() => setShowCreativeModal(false)}
          />
        </Modal>
      </div>
    </div>
  )
}
