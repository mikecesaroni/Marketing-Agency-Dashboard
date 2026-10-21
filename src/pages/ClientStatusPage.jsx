import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import SetupMessageModal from '../components/SetupMessageModal'
import OnboardingLinkPanel from '../components/OnboardingLinkPanel'
import { supabase } from '../lib/supabaseClient'
import { cacheBust, cached, keys } from '../lib/pageCache'
import { fetchClientStatus, setClientTier } from '../lib/clientStatusData'
import { bucketRows } from '../lib/clientStatus'
import { TIERS, tierPrice } from '../lib/clientTiers'
import { OWNER } from '../lib/nextSteps'
import { MODAL_KINDS, stepHref } from '../lib/stepLinks'
import { NOT_MARKABLE, canUndo, markStepDone, undoStepDone, whoAmI } from '../lib/completeStep'
import { telHref } from '../lib/clientGlance'
import { Badge, Button, Card } from '../components/ui'

/**
 * THE CLIENT STATUS BOARD. Every client, in the bucket of the package they
 * pay for, on one screen: what that package owes them, what is done, what is
 * next and whose move it is, and the FLAGS: anything that means somebody
 * should pick up the phone today (ads off, no leads while spending, no new
 * video in ten days, money overdue, a chase a week old).
 *
 * The checklist is the same launch pipeline the client page's Next-up bar
 * shows (src/lib/nextSteps.js), so the two never disagree; the package adds
 * its own steps (Google, LSA, the past customer list, the AI, the
 * automations). Ticks come from the data wherever the data knows (an ad
 * account connected, a campaign running) and from a person otherwise, and
 * can be taken back. The flags are worked out in src/lib/clientStatus.js.
 *
 * It took over from the Onboarding Progress board on 2026-10-20.
 */

const VIEWS = [
  ['all', 'Everyone'],
  ['contact', 'Needs a call'],
  ['client', 'Waiting on client'],
  ['clean', 'Running clean'],
]

const SEVERITY = {
  red: { dot: 'bg-red-500', text: 'text-red-800', bg: 'bg-red-50 border-red-200' },
  amber: { dot: 'bg-amber-400', text: 'text-amber-800', bg: 'bg-amber-50 border-amber-200' },
  blue: { dot: 'bg-blue-400', text: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' },
}

function OwnerChip({ owner }) {
  return owner === OWNER.client ? (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">client</span>
  ) : (
    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-800">us</span>
  )
}

/** The step's own button: a message to copy (a modal) or a place to go. */
function StepButton({ clientId, step, onModal, strong = false }) {
  const cls = strong
    ? `rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white ${step.owner === OWNER.us ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'}`
    : 'text-xs text-blue-700 hover:underline'
  if (MODAL_KINDS.has(step.action.kind)) {
    return (
      <button type="button" onClick={() => onModal(step)} className={cls}>
        {step.action.label}
      </button>
    )
  }
  return (
    <Link to={stepHref(clientId, step)} className={cls}>
      {step.action.label}
    </Link>
  )
}

/** The tick box: done, open, or waiting on another step. Click marks it done; a done one offers undo. */
function Tick({ step, onDone, onUndo }) {
  if (step.done) {
    return (
      <button
        type="button"
        onClick={() => canUndo(step) && onUndo(step)}
        title={canUndo(step) ? `${step.detail} Click to take it back.` : step.detail}
        className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-md border border-green-500 bg-green-500 text-[11px] font-bold text-white ${canUndo(step) ? 'cursor-pointer hover:bg-green-600' : 'cursor-default'}`}
        data-tick="done"
      >
        ✓
      </button>
    )
  }
  const canMark = !step.blocked && !NOT_MARKABLE.has(step.key)
  return (
    <button
      type="button"
      disabled={!canMark}
      onClick={() => canMark && onDone(step)}
      title={step.blocked ? `Waits on: ${step.blockedTitle || 'an earlier step'}` : NOT_MARKABLE.has(step.key) ? 'Recorded on the Payments page' : 'Mark done'}
      className={`mt-0.5 h-5 w-5 flex-shrink-0 rounded-md border ${step.blocked ? 'border-slate-200 bg-slate-100' : 'border-slate-400 bg-white hover:border-green-500 hover:bg-green-50'}`}
      data-tick={step.blocked ? 'blocked' : 'open'}
    />
  )
}

function TierPicker({ row, onChange }) {
  return (
    <select
      value={row.tier || ''}
      onChange={(e) => onChange(row.client, Number(e.target.value) || null)}
      title={row.guessed ? 'Guessed from the monthly fee. Pick it to confirm.' : 'The package this client is on'}
      className={`max-w-[11rem] rounded-lg border px-2 py-1 text-xs font-medium ${row.guessed ? 'border-amber-300 bg-amber-50 text-amber-900' : row.tier ? 'border-slate-300 bg-white text-slate-800' : 'border-red-300 bg-red-50 text-red-800'}`}
      data-tier-picker
    >
      <option value="">No package</option>
      {TIERS.map((t) => (
        <option key={t.tier} value={t.tier}>
          {t.short}
          {row.guessed && row.tier === t.tier ? ' (guessed)' : ''}
        </option>
      ))}
    </select>
  )
}

/**
 * One client. Closed, it is four things: the name and one status word, the
 * flags as short lines, the next step with its one button, and "More". Open,
 * the checklist (one plain list, in order), the owner and the links.
 */
function ClientCard({ row, open, onToggle, onModal, onDone, onUndo, onTier, onAssign }) {
  const { client, result, flags, intake } = row
  const next = result.next
  const phone = telHref(intact(intake?.contact_phone))
  const status = row.red ? ['Call them', 'danger'] : row.amber ? ['Chase', 'warning'] : client.paused_at ? ['Paused', 'dim'] : result.launched ? ['Running', 'success'] : ['Onboarding', 'info']
  const stripe = row.red ? 'bg-red-500' : row.amber ? 'bg-amber-400' : result.launched ? 'bg-green-500' : 'bg-slate-300'
  const byKey = new Map(result.steps.map((st) => [st.key, st]))

  return (
    <Card padding="none" className="overflow-hidden" data-status-card={client.id} data-needs-contact={row.needsContact ? 'yes' : 'no'}>
      <div className="flex">
        <div className={`w-1.5 flex-shrink-0 ${stripe}`} />
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-center gap-2">
            <Link to={`/client/${client.id}`} className="min-w-0 flex-1 truncate text-base font-bold text-slate-900 hover:text-blue-700 hover:underline">
              {client.name}
            </Link>
            {phone && (
              <a href={phone} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50" title={`Call ${intake.contact_phone}`}>
                📞
              </a>
            )}
            <Badge tone={status[1]} className="whitespace-nowrap">
              {status[0]}
            </Badge>
          </div>

          {/* THE FLAGS: the reasons to act today, worst first, one line each. */}
          {flags.length > 0 && (
            <ul className="mt-3 space-y-1" data-flags>
              {flags.map((f) => (
                <li key={f.key} data-flag={f.key}>
                  <Link to={f.href || `/client/${client.id}`} title={f.detail} className="flex items-start gap-2 text-sm hover:underline">
                    <span className={`mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${SEVERITY[f.severity].dot}`} />
                    <span className={`min-w-0 flex-1 ${SEVERITY[f.severity].text}`}>{f.label}</span>
                  </Link>
                  {open && f.detail && <p className="ml-4 text-xs text-slate-500">{f.detail}</p>}
                </li>
              ))}
            </ul>
          )}

          {/* THE NEXT STEP, and the one button that does it. */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {next ? (
              <>
                <span className="min-w-0 flex-1">
                  <span className="text-slate-500">Next: </span>
                  <span className="font-medium text-slate-900">{next.title}</span>
                  {next.owner === OWNER.client && <span className="text-slate-500"> (their move{next.waitingDays > 0 ? `, ${next.waitingDays}d` : ''})</span>}
                </span>
                <StepButton clientId={client.id} step={next} onModal={onModal} strong />
              </>
            ) : (
              <span className="text-slate-600">{result.launched ? 'Everything on the plan is done.' : 'Nothing outstanding.'}</span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={onToggle} aria-expanded={open} className="text-xs font-medium text-slate-500 hover:text-slate-900" data-checklist-toggle>
              {open ? 'Less' : `More · ${result.progress.done} of ${result.progress.total} done`}
            </button>
            <span className="ml-auto">
              <TierPicker row={row} onChange={onTier} />
            </span>
          </div>

          {open && (
            <div className="mt-3 border-t border-slate-100 pt-3" data-checklist>
              <ol className="space-y-1.5">
                {result.steps.map((st) => (
                  <li key={st.key} className="flex items-start gap-2 text-sm" data-step={st.key}>
                    <Tick step={{ ...st, blockedTitle: byKey.get(st.blockedBy)?.title }} onDone={onDone} onUndo={onUndo} />
                    <span className="min-w-0 flex-1" title={st.detail}>
                      <span className={st.done ? 'text-slate-400 line-through' : st.blocked ? 'text-slate-400' : 'text-slate-900'}>{st.title}</span>
                      {!st.done && !st.blocked && st.owner === OWNER.client && <span className="ml-1.5 text-xs text-amber-700">their move{st.waitingDays > 0 ? ` · ${st.waitingDays}d` : ''}</span>}
                      {!st.done && !st.blocked && (
                        <span className="block">
                          <StepButton clientId={client.id} step={st} onModal={onModal} />
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <label className="flex items-center gap-1">
                  Owner
                  <input
                    defaultValue={client.assigned_to || ''}
                    onBlur={(e) => e.target.value.trim() !== (client.assigned_to || '') && onAssign(client, e.target.value.trim())}
                    placeholder="Nobody yet"
                    list="team-names"
                    className="w-24 rounded-lg border border-slate-300 px-2 py-0.5 text-xs text-slate-800"
                  />
                </label>
                <Link to={`/client/${client.id}`} className="hover:underline">Client page</Link>
                <Link to={`/client/${client.id}#files`} className="hover:underline">Files</Link>
                <Link to={`/client/${client.id}#ad-performance`} className="hover:underline">Ads</Link>
                <Link to={`/client/${client.id}?open=studio`} className="hover:underline">Ad Studio</Link>
                <Link to="/content" className="hover:underline">Video board</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

/** A package's bucket: its name and price, how many need a call, then the cards. What it includes is on hover. */
function Bucket({ tier, rows, children }) {
  const t = TIERS.find((x) => x.tier === tier)
  const calls = rows.filter((r) => r.needsContact).length
  return (
    <section className="min-w-0" data-bucket={tier}>
      <header className="mb-3 flex flex-wrap items-baseline gap-x-2 px-1" title={t ? t.includes.join(' · ') : 'Pick a package on each card so the checklist knows what they are owed.'} data-bucket-head>
        <h2 className="text-base font-bold text-slate-900">{t ? t.short : 'No package set'}</h2>
        {t && <span className="text-sm text-slate-500">{tierPrice(tier)}</span>}
        <span className="ml-auto text-xs tabular-nums text-slate-500">
          {rows.length}
          {calls > 0 && <span className="ml-2 font-semibold text-red-700">{calls} to call</span>}
        </span>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

const intact = (v) => (typeof v === 'string' ? v : '')

export default function ClientStatusPage() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [view, setView] = useState('all')
  const [who, setWho] = useState('all')
  const [query, setQuery] = useState('')
  const [openAll, setOpenAll] = useState(false)
  const [toggled, setToggled] = useState({})
  const [modal, setModal] = useState(null) // { step, row }

  const load = () =>
    cached(keys.clientStatus(), fetchClientStatus, (r) => {
      setRows(r)
      setError('')
    }).catch((err) => setError(err.message))

  useEffect(() => {
    load()
  }, [])

  const names = useMemo(() => [...new Set((rows || []).map((r) => r.client.assigned_to).filter(Boolean))].sort(), [rows])

  const matching = useMemo(
    () =>
      (rows || []).filter((r) => {
        if (who !== 'all' && (r.client.assigned_to || '') !== who) return false
        if (query && !r.client.name.toLowerCase().includes(query.toLowerCase())) return false
        if (view === 'contact') return r.needsContact
        if (view === 'client') return r.result.theirs.length > 0 && r.result.ours.length === 0
        if (view === 'clean') return r.result.launched && !r.needsContact
        return true
      }),
    [rows, view, who, query]
  )

  // The board holds still while you work: marking a step done re-reads
  // everything, and the client just worked on is less urgent than a moment
  // ago, so a live re-sort would move it out from under the eye. Order and
  // membership are frozen when the filters are set and kept through every
  // save; a change of package re-freezes, so the card moves bucket.
  const [frozen, setFrozen] = useState(null)
  useEffect(() => {
    setFrozen(null)
  }, [view, who, query])
  useEffect(() => {
    if (frozen === null && rows) {
      const by = bucketRows(matching)
      setFrozen({ 1: by[1].map((r) => r.client.id), 2: by[2].map((r) => r.client.id), 3: by[3].map((r) => r.client.id), 0: by[0].map((r) => r.client.id) })
    }
  }, [frozen, rows, matching])

  const byId = useMemo(() => new Map((rows || []).map((r) => [r.client.id, r])), [rows])
  const bucket = (tier) => (frozen ? frozen[tier].map((id) => byId.get(id)).filter(Boolean) : [])

  const counts = useMemo(() => {
    const all = rows || []
    return {
      all: all.length,
      contact: all.filter((r) => r.needsContact).length,
      client: all.filter((r) => r.result.theirs.length > 0 && r.result.ours.length === 0).length,
      clean: all.filter((r) => r.result.launched && !r.needsContact).length,
    }
  }, [rows])

  const reload = () => {
    cacheBust(keys.nextSteps())
    cacheBust(keys.clients())
    return load()
  }
  const act = (fn) => async (...args) => {
    setError('')
    try {
      await fn(...args)
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }
  const markDone = act((client, step) => markStepDone(client, step, { by: whoAmI() }))
  const undo = act((client, step) => undoStepDone(client, step))
  const changeTier = act(async (client, tier) => {
    await setClientTier(client.id, tier)
    setFrozen(null)
  })
  const assign = act(async (client, name) => {
    const { error: err } = await supabase.from('clients').update({ assigned_to: name || null }).eq('id', client.id)
    if (err) throw err
  })

  const isOpen = (id) => toggled[id] ?? openAll
  const modalRow = modal?.row
  const modalKind = modal?.step?.action?.kind
  const tiersShown = [1, 2, 3, ...(bucket(0).length ? [0] : [])]

  return (
    <Layout
      title="Client tiers"
      subtitle={rows ? `${counts.contact} need a call · ${counts.client} waiting on a client · ${counts.clean} running clean` : 'Loading…'}
      actions={
        <Button variant="outline" size="lg" onClick={() => setOpenAll((o) => !o)} className="w-full md:w-auto" data-open-all>
          {openAll ? 'Close all' : 'Open all'}
        </Button>
      }
    >
      <datalist id="team-names">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {/* Pinned: the counts and the filters stay while the buckets scroll. */}
      <div className="sticky top-[68px] z-20 -mx-4 mb-4 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur md:top-[76px] md:-mx-8 md:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {VIEWS.map(([key, label]) => (
              <Button key={key} size="sm" variant={view === key ? 'dark' : 'outline'} onClick={() => setView(key)} className="whitespace-nowrap" data-view={key}>
                {label}
                <span className="ml-1.5 tabular-nums opacity-70">{counts[key] ?? ''}</span>
              </Button>
            ))}
          </div>
          <div className="flex flex-1 items-center gap-2 sm:justify-end">
            <select value={who} onChange={(e) => setWho(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs">
              <option value="all">Any owner</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a client" className="w-36 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs" />
          </div>
        </div>
      </div>

      {!rows ? (
        <p className="text-slate-500">Loading…</p>
      ) : matching.length === 0 ? (
        <Card padding="lg" className="text-center text-sm text-slate-500">
          {view === 'contact' ? 'Nobody needs a call. Nothing is off, overdue or waiting too long.' : 'Nothing here.'}
        </Card>
      ) : (
        <div className={`grid gap-4 lg:grid-cols-2 ${tiersShown.length > 3 ? '2xl:grid-cols-4' : 'xl:grid-cols-3'}`} data-buckets>
          {tiersShown.map((tier) => (
            <Bucket key={tier} tier={tier} rows={bucket(tier)}>
              {bucket(tier).length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-400">Nobody here{view !== 'all' ? ' in this view' : ''}.</p>
              ) : (
                bucket(tier).map((r) => (
                  <ClientCard
                    key={r.client.id}
                    row={r}
                    open={isOpen(r.client.id)}
                    onToggle={() => setToggled((t) => ({ ...t, [r.client.id]: !isOpen(r.client.id) }))}
                    onModal={(step) => setModal({ step, row: r })}
                    onDone={(step) => markDone(r.client, step)}
                    onUndo={(step) => undo(r.client, step)}
                    onTier={changeTier}
                    onAssign={assign}
                  />
                ))
              )}
            </Bucket>
          ))}
        </div>
      )}

      {modalRow && ['meta-access', 'google-ads-access'].includes(modalKind) && (
        <SetupMessageModal
          channel={modalKind === 'meta-access' ? 'meta' : 'googleads'}
          client={modalRow.client}
          intake={modalRow.intake}
          onClose={() => setModal(null)}
        />
      )}
      <Modal
        isOpen={Boolean(modalRow && ['send-onboarding', 'send-ghl'].includes(modalKind))}
        onClose={() => {
          setModal(null)
          reload()
        }}
        title={modalKind === 'send-ghl' ? `Send the GHL setup link · ${modalRow?.client.name}` : `Send the onboarding link · ${modalRow?.client.name}`}
      >
        {modalRow && (
          <OnboardingLinkPanel
            client={modalRow.client}
            fixedMode={modalKind === 'send-ghl' ? 'ghl' : modalRow.result.steps.find((s) => s.key === 'ghl-form') && !modalRow.result.steps.find((s) => s.key === 'ghl-form')?.done ? 'both' : 'intake'}
          />
        )}
      </Modal>
    </Layout>
  )
}
