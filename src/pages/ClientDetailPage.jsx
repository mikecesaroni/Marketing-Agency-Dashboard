import { useEffect, useState } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { fetchAdDaily, summariseAds } from '../lib/queries'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import ClientDeliverablesSection from '../components/ClientDeliverablesSection'
import MetaAdAccountCard from '../components/MetaAdAccountCard'
import LiveToggle from '../components/LiveToggle'
import AdPerformanceSection from '../components/AdPerformanceSection'
import ClientBriefPanel from '../components/ClientBriefPanel'
import ClientChatPanel from '../components/ClientChatPanel'
import AdStudioPanel from '../components/AdStudioPanel'
import OnboardingIntakeForm from '../components/OnboardingIntakeForm'
import LogKPIsForm from '../components/LogKPIsForm'
import AddWorkLogForm from '../components/AddWorkLogForm'
import AddCreativeForm from '../components/AddCreativeForm'
import ClientFilesSection from '../components/ClientFilesSection'
import PaymentTracker from '../components/PaymentTracker'
import {
  addTask,
  deleteTask,
  extractTasksFromChat,
  fetchTasks,
  toggleTask as toggleTaskRow,
} from '../lib/clientTasks'

// Deep links like /client/:id#ad-performance come from the Reports table.
// The ad section renders nothing until its own fetch resolves, so scrolling on
// mount would land on a zero-height div and leave you at the top of the page.
// Wait until the target actually has height, then scroll once.
function useHashScroll(ready) {
  const { hash } = useLocation()

  useEffect(() => {
    if (!ready || !hash) return

    const id = hash.slice(1)
    const startedAt = Date.now()
    let frame

    const tryScroll = () => {
      const el = document.getElementById(id)
      if (el && el.getBoundingClientRect().height > 0) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      // Give up rather than spin forever if that section never renders.
      if (Date.now() - startedAt < 3000) frame = requestAnimationFrame(tryScroll)
    }

    frame = requestAnimationFrame(tryScroll)
    return () => cancelAnimationFrame(frame)
  }, [hash, ready])
}

export default function ClientDetailPage() {
  const { clientId } = useParams()
  const [client, setClient] = useState(null)
  const [tasks, setTasks] = useState([])
  const [newTask, setNewTask] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractNote, setExtractNote] = useState('')
  const [weeklyKPIs, setWeeklyKPIs] = useState([])
  const [workLogs, setWorkLogs] = useState([])
  const [creativeLogs, setCreativeLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showIntakeModal, setShowIntakeModal] = useState(false)
  const [showKPIsModal, setShowKPIsModal] = useState(false)
  const [showWorkLogModal, setShowWorkLogModal] = useState(false)
  const [showCreativeModal, setShowCreativeModal] = useState(false)
  const [showBriefModal, setShowBriefModal] = useState(false)
  const [showChatModal, setShowChatModal] = useState(false)
  // Set when the chat is opened from a task rather than the button, so it
  // knows to open straight into a conversation about that task instead of a
  // blank box. Null on the ordinary open.
  const [chatSeed, setChatSeed] = useState(null)
  const [showStudioModal, setShowStudioModal] = useState(false)
  const [intake, setIntake] = useState(null)
  const [briefAds, setBriefAds] = useState([])
  // Copy handed from the chat to the Ad Studio. Null means "start from intake".
  const [studioSeed, setStudioSeed] = useState(null)

  useHashScroll(!loading && !!client)

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

      const tasksData = await fetchTasks(clientId)

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

      // The brief needs both, but neither should be able to break the page.
      const [intakeRes, adRows] = await Promise.all([
        supabase.from('onboarding_intake').select('*').eq('client_id', clientId).maybeSingle(),
        fetchAdDaily(clientId).catch(() => []),
      ])
      setIntake(intakeRes?.data || null)
      setBriefAds(summariseAds(adRows || []))

      setClient(clientData)
      setTasks(tasksData)
      setWeeklyKPIs(kpisData)
      setWorkLogs(logsData)
      setCreativeLogs(creativesData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleArchive = async () => {
    const next = !client.archived
    if (next && !confirm(`Archive ${client.name}? They'll drop out of MRR, the Meta sync and every list, but nothing is deleted.`)) return

    const { error: err } = await supabase.from('clients').update({ archived: next }).eq('id', client.id)
    if (err) setError(err.message)
    else loadClientData()
  }

  const handleToggleTask = async (taskId, currentDone) => {
    try {
      await toggleTaskRow(taskId, currentDone)
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                done: !currentDone,
                date_completed: !currentDone ? new Date().toISOString().split('T')[0] : null,
              }
            : t
        )
      )
    } catch (err) {
      setError(err.message)
    }
  }

  const handleAddTask = async () => {
    const name = newTask.trim()
    if (!name) return
    setNewTask('')
    try {
      const row = await addTask(clientId, name)
      setTasks((prev) => [...prev, row])
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteTask = async (taskId) => {
    try {
      await deleteTask(taskId)
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
    } catch (err) {
      setError(err.message)
    }
  }

  // Opens the chat already talking about one task, instead of a blank box the
  // agency has to re-explain the task into.
  const handleAskAboutTask = (task) => {
    const context = task.notes ? `\n\nContext: ${task.notes}` : ''
    setChatSeed(`How do I complete "${task.task_name}" and do it well?${context}`)
    setShowChatModal(true)
  }

  // Reads the client's chat history — Fireflies summaries pasted in, "remember
  // this" asides — and turns whatever is still actionable into rows here.
  const handleExtractTasks = async () => {
    setExtracting(true)
    setExtractNote('')
    setError('')
    try {
      const res = await extractTasksFromChat(clientId)
      if (res.inserted > 0) {
        setTasks((prev) => [...prev, ...res.tasks])
        setExtractNote(`Added ${res.inserted} task${res.inserted === 1 ? '' : 's'} from the chat.`)
      } else {
        setExtractNote(res.note || 'Nothing new to pull from the chat.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setExtracting(false)
      setTimeout(() => setExtractNote(''), 5000)
    }
  }

  // The whole point of the handoff: the hook, offer and CTA the chat wrote go
  // straight onto the artboards instead of being re-typed.
  const handleUseCreativeSet = (mapped) => {
    setStudioSeed(mapped)
    setShowChatModal(false)
    setShowStudioModal(true)
  }

  const handleDataAdded = async (type) => {
    if (type === 'intake') {
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
      <Layout title="Client">
        <p className="text-slate-500">Loading...</p>
      </Layout>
    )
  }

  if (error || !client) {
    return (
      <Layout title="Client">
        <Link to="/clients" className="text-sm text-blue-600 hover:text-blue-800">
          ← All clients
        </Link>
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error || 'Client not found'}
        </div>
      </Layout>
    )
  }

  const progressDone = tasks.filter((t) => t.done).length
  const progressTotal = tasks.length
  const progressPercent = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0
  // Open tasks first, done ones sink to the bottom struck through — this is a
  // working list, not a log, so what still needs doing should be on top.
  const sortedTasks = [...tasks].sort((a, b) => Number(a.done) - Number(b.done))

  const intakeButton = (
    <div className="flex flex-col md:flex-row gap-2">
      <button
        onClick={() => {
          setStudioSeed(null)
          setShowStudioModal(true)
        }}
        className="w-full md:w-auto px-4 py-2.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition"
      >
        🎨 Ad Studio
      </button>
      <button
        onClick={() => {
          setChatSeed(null)
          setShowChatModal(true)
        }}
        className="w-full md:w-auto px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
      >
        💬 Ask about {client.name}
      </button>
      <button
        onClick={() => setShowBriefModal(true)}
        className="w-full md:w-auto px-4 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition"
      >
        📋 Client Brief
      </button>
      <button
        onClick={() => setShowIntakeModal(true)}
        className="w-full md:w-auto px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition"
      >
        Intake Form
      </button>
    </div>
  )

  return (
    <Layout title={client.name} subtitle={client.industry || 'No industry set'} actions={intakeButton}>
      <div>
        <Link
          to="/clients"
          className="inline-block mb-4 text-sm text-blue-600 hover:text-blue-800"
        >
          ← All clients
        </Link>

        {client.archived && (
          <div className="mb-3 p-3 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-700">
            This client is archived — excluded from MRR, the Meta sync and every list.
          </div>
        )}

        <div className="mb-6 md:mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex gap-2 flex-wrap">
              <LiveToggle
                clientId={client.id}
                field="meta_ads_active"
                label="Meta ads"
                value={client.meta_ads_active}
                onChange={loadClientData}
              />
              <LiveToggle
                clientId={client.id}
                field="lsa_active"
                label="Google LSA"
                value={client.lsa_active}
                onChange={loadClientData}
                doneWord="optimized"
              />
              <LiveToggle
                clientId={client.id}
                field="gbp_optimized"
                label="Google Business Profile"
                value={client.gbp_optimized}
                onChange={loadClientData}
                doneWord="optimized"
              />
            </div>
            <button
              onClick={handleToggleArchive}
              className="sm:ml-auto text-xs text-slate-400 hover:text-slate-700 transition text-left"
            >
              {client.archived ? '↩ Restore client' : 'Archive client'}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 bg-white rounded-xl border border-slate-200 p-4">
            <div>
              <p className="text-xs text-slate-500 uppercase font-medium">Industry</p>
              <p className="font-semibold text-slate-900 text-sm md:text-base">{client.industry || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-medium">Market</p>
              <p className="font-semibold text-slate-900 text-sm md:text-base">{client.market || '—'}</p>
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

        {/* TASKS */}
        <div className="bg-white rounded-lg md:rounded-xl shadow-sm border border-slate-200 p-4 md:p-6 mb-6 md:mb-8">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2 mb-4">
            <h2 className="text-xl font-bold text-slate-900">Tasks</h2>
            <button
              onClick={handleExtractTasks}
              disabled={extracting}
              title="The chat already checks itself after every message — use this to re-check on demand, or to pull from a conversation that happened before that started."
              className="w-full md:w-auto px-3 py-2 md:py-1.5 text-sm bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 transition"
            >
              {extracting ? 'Reading chat...' : '✨ Check chat now'}
            </button>
          </div>

          <p className="text-xs text-slate-400 mb-3">
            New tasks get pulled in automatically after every chat message — this button is only for
            a re-check on demand.
          </p>

          {extractNote && <p className="text-xs text-slate-500 mb-3">{extractNote}</p>}

          {progressTotal > 0 && (
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
          )}

          <div className="flex gap-2 mb-3">
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddTask()
                }
              }}
              placeholder="Add a task..."
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              onClick={handleAddTask}
              disabled={!newTask.trim()}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              Add
            </button>
          </div>

          {sortedTasks.length === 0 ? (
            <p className="text-sm text-slate-500">
              No tasks yet. Add one, or pull from what&rsquo;s already been discussed in the chat.
            </p>
          ) : (
            <div className="space-y-1">
              {sortedTasks.map((task) => (
                <div
                  key={task.id}
                  className="group flex items-start gap-3 p-2 rounded hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() => handleToggleTask(task.id, task.done)}
                    className="w-4 h-4 rounded mt-0.5 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => handleAskAboutTask(task)}
                      title="Ask the chat how to do this well"
                      className={`text-left hover:text-blue-600 hover:underline ${
                        task.done ? 'line-through text-slate-400' : 'text-slate-700'
                      }`}
                    >
                      {task.task_name}
                    </button>
                    {task.source === 'chat' && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px] font-semibold align-middle">
                        from chat
                      </span>
                    )}
                    {task.notes && <p className="text-xs text-slate-400 mt-0.5">{task.notes}</p>}
                  </div>
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 text-sm flex-shrink-0 transition"
                    aria-label={`Delete ${task.task_name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
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

        {/* META ADS SYNC */}
        <div className="mt-6 md:mt-8">
          <MetaAdAccountCard
            client={client}
            weeklyKPIs={weeklyKPIs}
            onUpdate={loadClientData}
          />
        </div>

        {/* AD PERFORMANCE */}
        <div id="ad-performance" className="mt-6 md:mt-8 scroll-mt-4">
          <AdPerformanceSection clientId={clientId} />
        </div>

        {/* DELIVERABLES */}
        <div className="mt-6 md:mt-8">
          <ClientDeliverablesSection clientId={clientId} />
        </div>

        {/* CLIENT FILES */}
        <div className="mt-6 md:mt-8 mb-6 md:mb-8">
          <ClientFilesSection clientId={clientId} clientName={client.name} />
        </div>

        {/* PAYMENTS */}
        <div className="mb-6 md:mb-8">
          <PaymentTracker client={client} onClientUpdate={loadClientData} />
        </div>

        {/* MODALS */}
        <Modal
          isOpen={showStudioModal}
          onClose={() => setShowStudioModal(false)}
          title={`Ad Studio — ${client.name}`}
          wide
        >
          <AdStudioPanel client={client} intake={intake} seed={studioSeed} />
        </Modal>

        <Modal
          isOpen={showChatModal}
          onClose={() => {
            setShowChatModal(false)
            setChatSeed(null)
          }}
          title={`${client.name} — Chat`}
          wide
        >
          <ClientChatPanel
            client={client}
            intake={intake}
            ads={briefAds}
            onUseCreativeSet={handleUseCreativeSet}
            onTasksAdded={(newTasks) => setTasks((prev) => [...prev, ...newTasks])}
            autoPrompt={chatSeed}
          />
        </Modal>

        <Modal
          isOpen={showBriefModal}
          onClose={() => setShowBriefModal(false)}
          title={`Client Brief — ${client.name}`}
          wide
        >
          <ClientBriefPanel client={client} intake={intake} ads={briefAds} />
        </Modal>

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
    </Layout>
  )
}
