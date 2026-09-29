import { useEffect, useState } from 'react'
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { fetchAdDaily, summariseAds, today } from '../lib/queries'
import { pauseCleanup } from '../lib/billing'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../lib/access'
import DeleteClientButton from '../components/DeleteClientButton'
import Modal from '../components/Modal'
import MetaAdAccountCard from '../components/MetaAdAccountCard'
import LiveToggle from '../components/LiveToggle'
import AdPerformanceSection from '../components/AdPerformanceSection'
import AdDoctorPanel from '../components/AdDoctorPanel'
import FunnelPanel from '../components/FunnelPanel'
import GoogleSearchPanel from '../components/GoogleSearchPanel'
import ClientChatPanel from '../components/ClientChatPanel'
import AdStudioPanel from '../components/AdStudioPanel'
import LogKPIsForm from '../components/LogKPIsForm'
import ClientFilesSection from '../components/ClientFilesSection'
import PaymentTracker from '../components/PaymentTracker'
import ClientFormsPanel from '../components/ClientFormsPanel'
import OnboardingCallPanel from '../components/OnboardingCallPanel'
import NextUpBar from '../components/NextUpBar'
import ClientSnapshot from '../components/ClientSnapshot'
import ClientTasksPanel from '../components/ClientTasksPanel'
import SetupMessageModal from '../components/SetupMessageModal'
import OnboardingLinkPanel from '../components/OnboardingLinkPanel'
import { fetchNextStepsFor } from '../lib/nextStepsData'
import { markStepDone, undoStepDone, whoAmI } from '../lib/completeStep'
import { Button, Card } from '../components/ui'

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
  const navigate = useNavigate()
  const { role } = useAuth()
  const [client, setClient] = useState(null)
  // This client's rows from the Tasks tab, as the task panel last loaded
  // them, for the open-task count up top. tasksKey remounts the panel when
  // the chat adds tasks behind its back.
  const [tasks, setTasks] = useState([])
  const [tasksKey, setTasksKey] = useState(0)
  const [weeklyKPIs, setWeeklyKPIs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showKPIsModal, setShowKPIsModal] = useState(false)
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
  // Whether the Ad Studio was reached from the chat. Only then is there a
  // conversation to go back TO, so only then is a back button honest.
  const [studioFromChat, setStudioFromChat] = useState(false)
  /**
   * Bumped every time a DIFFERENT ad is opened, and used as the Studio's key
   * so a new one gets a fresh mount.
   *
   * Needed because the Studio now stays mounted while the chat sits on top of
   * it, which is what makes going back keep your work. The seed effect in
   * there applies a creative set over whatever state is already present, and
   * three of the fields it sets are conditional on the set naming them --
   * badge, accent, badge colour -- because those normally come from the client
   * rather than the ad. On a mounted panel that means an accent named by the
   * first ad would still be showing under the second one that did not name a
   * colour: a hybrid of two ads, which is not what clicking the second one
   * asks for. Remounting sidesteps it without touching that logic.
   */
  const [studioKey, setStudioKey] = useState(0)

  useHashScroll(!loading && !!client)

  // The launch pipeline for the Next-up bar. Refreshed with the client, and
  // again after anything on the page changes state, so a toggle flipped or a
  // form submitted moves the bar without a reload.
  const [nextUp, setNextUp] = useState(null)
  // Which access message is open (meta, lsa, gbp) and which onboarding link
  // message is being sent (intake, ghl, both), from the Next-up bar.
  const [setupModal, setSetupModal] = useState(null)
  const [sendModal, setSendModal] = useState(null)
  // The tab the Studio opens on: Publish when publishing is the next move.
  const [studioTab, setStudioTab] = useState('design')
  // A clip to open Publish on, from the Content board's "click to publish".
  const [studioVideo, setStudioVideo] = useState('')
  // Content → Publish → Build a funnel: land with the funnel card open.
  const [funnelOpen, setFunnelOpen] = useState(false)

  const loadNextUp = () =>
    fetchNextStepsFor(clientId)
      .then(setNextUp)
      .catch(() => setNextUp(null))

  // /client/:id?open=studio|publish|kpis, from the Deliverables board and the
  // dashboard: land with the right thing already open, once, after the client
  // has loaded. The param is then dropped so a refresh does not reopen it.
  const pageLocation = useLocation()
  useEffect(() => {
    if (loading || !client) return
    const want = new URLSearchParams(pageLocation.search).get('open')
    if (!want) return
    if (want === 'studio') openStudio('design')
    else if (want === 'publish') openStudio('publish', new URLSearchParams(pageLocation.search).get('video') || '')
    else if (want === 'kpis') setShowKPIsModal(true)
    else if (want === 'funnel') {
      setFunnelOpen(true)
      // After the card has rendered open, so the scroll lands on the builder.
      setTimeout(() => scrollTo('funnel'), 150)
    }
    navigate({ pathname: pageLocation.pathname, hash: pageLocation.hash }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, client?.id, pageLocation.search])

  useEffect(() => {
    loadClientData()
  }, [clientId])

  const loadClientData = async () => {
    loadNextUp()
    try {
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single()

      if (clientError) throw clientError

      const { data: kpisData, error: kpisError } = await supabase
        .from('weekly_kpis')
        .select('*')
        .eq('client_id', clientId)
        .order('week_of', { ascending: false })

      if (kpisError) throw kpisError

      // The brief needs both, but neither should be able to break the page.
      const [intakeRes, adRows] = await Promise.all([
        supabase.from('onboarding_intake').select('*').eq('client_id', clientId).maybeSingle(),
        fetchAdDaily(clientId).catch(() => []),
      ])
      setIntake(intakeRes?.data || null)
      setBriefAds(summariseAds(adRows || []))

      setClient(clientData)
      setWeeklyKPIs(kpisData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Pause: still a client, just not expected to be running ads or paying
  // right now. The dashboard's "ads account paused" alert and the video
  // board's 10+ days flag leave a paused client alone; they drop out of MRR
  // and the months inside the pause are not owed (src/lib/billing.js).
  //
  // Resuming tidies the schedule: the paused months already behind us were
  // never invoiced by Stripe, so they are removed rather than left to turn
  // overdue all at once. Months still ahead stay and carry on as before.
  const handleTogglePause = async () => {
    const next = client.paused_at ? null : new Date().toISOString()
    if (next && !confirm(`Pause ${client.name}? They stay a client, but from today they are out of MRR, their scheduled months are not owed, and the ads-stopped alert and the video board stop expecting ads from them until you resume.`)) return
    let stale = []
    if (!next) {
      const { data: rows, error: payErr } = await supabase
        .from('payments')
        .select('id, payment_type, status, due_date, amount')
        .eq('client_id', client.id)
      if (payErr) return setError(payErr.message)
      stale = pauseCleanup(client, rows || [], today())
      const list = stale.map((p) => p.due_date).join(', ')
      const note = stale.length
        ? ` ${stale.length} paused ${stale.length === 1 ? 'month' : 'months'} (${list}) will be cleared from the schedule; Stripe never billed them.`
        : ''
      if (!confirm(`Resume ${client.name}? They come back into MRR and the alerts from today.${note}`)) return
    }
    if (stale.length) {
      const { error: delErr } = await supabase.from('payments').delete().in('id', stale.map((p) => p.id))
      if (delErr) return setError(delErr.message)
    }
    const { error: err } = await supabase.from('clients').update({ paused_at: next }).eq('id', client.id)
    if (err) setError(err.message)
    else loadClientData()
  }

  const handleToggleArchive = async () => {
    const next = !client.archived
    if (next && !confirm(`Archive ${client.name}? They'll drop out of MRR, the Meta sync and every list, but nothing is deleted.`)) return

    const { error: err } = await supabase.from('clients').update({ archived: next }).eq('id', client.id)
    if (err) setError(err.message)
    else loadClientData()
  }

  // Opens the chat already talking about one task, instead of a blank box the
  // agency has to re-explain the task into.
  const handleAskAboutTask = (task) => {
    const context = task.description ? `\n\nContext: ${task.description}` : ''
    setChatSeed(`How do I complete "${task.title}" and do it well?${context}`)
    setShowChatModal(true)
  }

  // The whole point of the handoff: the hook, offer and CTA the chat wrote go
  // straight onto the artboards instead of being re-typed.
  const handleUseCreativeSet = (mapped) => {
    setStudioTab('design')
    setStudioSeed(mapped)
    setStudioKey((k) => k + 1)
    setStudioFromChat(true)
    setShowChatModal(false)
    setShowStudioModal(true)
  }

  /**
   * Back to the chat, to pick a different one of the ads it wrote.
   *
   * Deliberately leaves the Studio OPEN underneath. The chat modal renders
   * after it and so paints on top, which means coming back finds the artboard
   * exactly as it was left -- colours, photo, every edited line. Closing the
   * Studio to show the chat would unmount it and throw all of that away, and
   * the whole reason for going back is to try another angle without losing the
   * work already done on this one.
   *
   * The conversation itself is reloaded from chat_messages on mount, and the
   * creative-set cards are parsed back out of the stored replies, so the other
   * ads are all still there to click.
   */
  const backToChat = () => {
    setChatSeed(null)
    setShowChatModal(true)
  }

  // One step on the Next-up bar, one thing opened. The kinds are the ones
  // nextSteps() emits; anything unknown opens the Onboarding Progress board,
  // which is where the deliverables list lives now it is off this page.
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const openStudio = (tab, video = '') => {
    setStudioTab(tab)
    setStudioVideo(video)
    setStudioSeed(null)
    setStudioKey((k) => k + 1)
    setStudioFromChat(false)
    setShowStudioModal(true)
  }
  const handleNextAction = (step) => {
    switch (step?.action?.kind) {
      case 'payments':
        return navigate('/payments')
      case 'send-onboarding':
        return setSendModal(client?.ghl_plan && !nextUp?.result?.steps.find((s) => s.key === 'ghl-form')?.done ? 'both' : 'intake')
      case 'send-ghl':
        return setSendModal('ghl')
      case 'call':
        return scrollTo('onboarding-call')
      case 'meta-access':
        return setSetupModal('meta')
      case 'google-ads-access':
        return setSetupModal('googleads')
      case 'gbp':
        return setSetupModal('gbp')
      case 'ghl-toggle':
      case 'meta-toggle':
        // The toggle row is gone; the step's own flag is written directly.
        return markStepDone(client, step, { by: whoAmI() })
          .then(loadClientData)
          .catch((err) => setError(err.message))
      case 'studio':
        return openStudio('design')
      case 'publish':
        return openStudio('publish')
      case 'kpis':
        return setShowKPIsModal(true)
      case 'report':
        return navigate('/reports')
      case 'google-report':
        return navigate(`/reports/google-search/${client.id}`)
      default:
        return navigate('/deliverables')
    }
  }

  // The KPI logger is the one form left on this page.
  const handleKpisLogged = () => {
    setShowKPIsModal(false)
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

  const intakeButton = (
    <div className="flex flex-col md:flex-row gap-2">
      {/* Orange, blue, green, indigo and white, previously, which told a
          reader nothing except that five different days had gone into it. The
          two that actually make something are emphasised; the three that open
          a form recede. */}
      <Button
        size="lg"
        onClick={() => openStudio('design')}
        className="w-full md:w-auto"
      >
        Ad Studio
      </Button>
      <Button
        variant="dark"
        size="lg"
        onClick={() => {
          setChatSeed(null)
          setShowChatModal(true)
        }}
        className="w-full md:w-auto"
      >
        Ask about {client.name}
      </Button>
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

        {client.paused_at && !client.archived && (
          <div className="mb-3 flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 sm:flex-row sm:items-center">
            <p className="text-sm text-amber-900">
              <span className="font-semibold">On pause</span> since{' '}
              {new Date(client.paused_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}. Out
              of MRR, scheduled months from then are not owed, and no ads-stopped alert or
              &ldquo;10+ days without an ad&rdquo; flag until they are resumed. Everything else is unchanged.
            </p>
            <Button variant="outline" size="sm" onClick={handleTogglePause} className="sm:ml-auto sm:flex-shrink-0">
              ▶ Resume client
            </Button>
          </div>
        )}

        {client.archived && (
          <div className="mb-3 p-3 bg-slate-100 border border-slate-300 rounded-lg flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="text-sm text-slate-700">
              This client is archived — excluded from MRR, the Meta sync and every list. Nothing has
              been deleted.
            </p>
            {/* Permanent delete lives here rather than next to Archive, because
                it only ever applies to a client that is already archived, and
                because the two should not sit close enough to misclick. */}
            <div className="sm:ml-auto sm:flex-shrink-0">
              <DeleteClientButton client={client} onDeleted={() => navigate('/clients')} />
            </div>
          </div>
        )}

        {/* WHAT IS NEXT. Sticky, first, and the same pipeline the Deliverables
            board and the dashboard show, so nobody has to scroll a long page
            to find out where this client stands or whose move it is. */}
        <NextUpBar
          result={nextUp?.result}
          assignedTo={client.assigned_to}
          onAssign={async (name) => {
            await supabase.from('clients').update({ assigned_to: name || null }).eq('id', client.id)
            loadClientData()
          }}
          onAction={handleNextAction}
          controls={
            <>
              {/* GHL is the one service not every client buys, and whether it
                  is part of the plan is the one switch with no step of its
                  own. Everything else on the old toggle row is a step above. */}
              <LiveToggle
                clientId={client.id}
                field="ghl_plan"
                label="GHL build"
                value={client.ghl_plan}
                onChange={loadClientData}
                doneWord="on plan"
                clearsWhenOff={['ghl_active']}
              />
              {!client.archived && (
                <Button variant="ghost" size="sm" onClick={handleTogglePause} className="ml-auto text-slate-400" title="Still a client; out of MRR and the ads alerts, paused months not owed, until resumed">
                  {client.paused_at ? '▶ Resume client' : '⏸ Pause client'}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleToggleArchive} className={`text-slate-400 ${client.archived ? 'ml-auto' : ''}`}>
                {client.archived ? '↩ Restore client' : 'Archive client'}
              </Button>
            </>
          }
          onDone={async (step) => {
            try {
              await markStepDone(client, step, { by: whoAmI() })
              loadClientData()
            } catch (err) {
              setError(err.message)
            }
          }}
          onUndo={async (step) => {
            try {
              await undoStepDone(client, step)
              loadClientData()
            } catch (err) {
              setError(err.message)
            }
          }}
        />

        {/* HOW TO REACH THEM, AND HOW THEY ARE DOING. Phone, email and
            website up front, then five numbers from the rest of the CRM.
            (The Industry / Market / Meta-day / LSA-day card that sat here
            showed typed-in budgets; these are the real numbers.) */}
        <ClientSnapshot client={client} intake={intake} tasks={tasks} showMoney={isAdmin(role)} />

        {/* CLIENT FORMS — what they have sent back, and how to chase the rest.
            High up on purpose: at the start of a client this is the whole job,
            and it was previously three buttons in the header that gave no hint
            whether anything had come back. */}
        <ClientFormsPanel client={client} intake={intake} onDataChanged={loadClientData} />

        {/* THE LIVE ONBOARDING CALL. The forms above are what the client sends
            back; this is the Zoom where the agency gets every access done on
            the owner's own screen, worked as a sheet. */}
        <div id="onboarding-call" className="scroll-mt-40">
          <OnboardingCallPanel client={client} intake={intake} />
        </div>

        {/* TASKS, straight from the Tasks tab: one list, not two. */}
        <ClientTasksPanel key={tasksKey} client={client} onAsk={handleAskAboutTask} onChange={setTasks} />

        {/* WEEKLY KPIs */}
        <Card padding="none" className="mb-6 p-4 md:mb-8 md:p-6">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-4">
            <h2 className="text-lg md:text-xl font-bold text-slate-900">Weekly KPI History</h2>
            <Button
              size="sm"
              onClick={() => setShowKPIsModal(true)}
              className="w-full touch-none md:w-auto"
            >
              + Log KPIs
            </Button>
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
        </Card>

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

        {/* AD DOCTOR — the playbook's kill/scale rules run on the sync data */}
        <Card id="ad-doctor" padding="none" className="mt-6 p-4 md:mt-8 md:p-6 scroll-mt-4">
          <h2 className="text-lg md:text-xl font-bold text-slate-900 mb-3">Ad Doctor Agent</h2>
          <AdDoctorPanel client={client} />
        </Card>

        {/* FUNNEL — the top-of-funnel / retargeting campaign pair, built paused
            with no creative. Here rather than only inside publish, because the
            structure is supposed to exist before there is anything to put in
            it, and publish lives inside the creative tool. */}
        <div id="funnel" className="mt-6 scroll-mt-4 md:mt-8">
          <FunnelPanel key={funnelOpen ? 'open' : 'closed'} client={client} intake={intake} initialOpen={funnelOpen} />
        </div>

        {/* GOOGLE SEARCH — keywords and search terms, from the nightly sync.
            Below Ad Doctor because it is the same job for the other channel:
            what is losing money and what to switch off. */}
        <div id="google-search" className="mt-6 scroll-mt-4 md:mt-8">
          <GoogleSearchPanel client={client} onUpdate={loadClientData} />
        </div>

        {/* CLIENT FILES */}
        <div className="mt-6 md:mt-8 mb-6 md:mb-8">
          <ClientFilesSection
            clientId={clientId}
            clientName={client.name}
            driveFolderId={client.drive_folder_id}
          />
        </div>

        {/* PAYMENTS. Admin only: the database would hand a VA an empty tracker
            anyway (row-level security on payments), and an empty money panel
            reads as "this client has never paid". */}
        {isAdmin(role) && (
          <div id="payments" className="mb-6 scroll-mt-40 md:mb-8">
            <PaymentTracker client={client} onClientUpdate={loadClientData} />
          </div>
        )}

        {/* MODALS */}
        {setupModal && (
          <SetupMessageModal channel={setupModal} client={client} intake={intake} onClose={() => setSetupModal(null)} />
        )}
        <Modal
          isOpen={Boolean(sendModal)}
          onClose={() => {
            setSendModal(null)
            loadNextUp()
          }}
          title={sendModal === 'ghl' ? 'Send the GHL setup link' : 'Send the onboarding link'}
        >
          {sendModal && <OnboardingLinkPanel client={client} fixedMode={sendModal} />}
        </Modal>
        {/* The Studio is a full-screen frame of its own rather than a modal:
            three artboards, a photo picker and the publish flow do not fit
            in a dialog. */}
        {showStudioModal && (
          <AdStudioPanel
            key={studioKey}
            client={client}
            intake={intake}
            seed={studioSeed}
            initialTab={studioTab}
            initialVideo={studioVideo}
            onClose={() => {
              setShowStudioModal(false)
              setStudioFromChat(false)
            }}
            onBack={studioFromChat ? backToChat : undefined}
            backLabel="Chat"
          />
        )}

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
            onTasksAdded={() => setTasksKey((k) => k + 1)}
            autoPrompt={chatSeed}
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
            onSuccess={handleKpisLogged}
            onClose={() => setShowKPIsModal(false)}
          />
        </Modal>

      </div>
    </Layout>
  )
}
