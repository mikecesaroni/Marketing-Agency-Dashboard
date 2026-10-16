import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { LENGTHS, SETTINGS, SPEAKERS, TONES, TOPICS, askLabel, ideasFor } from '../../supabase/functions/_shared/scriptStudio.js'
import { TRADE_WORDS, phaseOf, playbookText } from '../lib/seasonPlaybook'
import { loadStudio, reviseScript, saveVoice, setScriptStatus, topicsUsedRecently, writeScript } from '../lib/scriptStudioStore'
import ScriptView from '../components/scripts/ScriptView'
import VoiceSheet from '../components/scripts/VoiceSheet'

/**
 * The Video Script Studio: a client's own page, from the private token in
 * their link (the same token as their dashboard). Built for an owner on a
 * phone who is not a computer person: three ready picks for the week at
 * the top, one tap writes the script, big type to read it off the screen,
 * a teleprompter, and one-tap changes when it does not sound like them.
 * No login and no agency chrome. The page talks only to the script-studio
 * function; see docs/script-studio.md.
 */

const AGENCY = 'The Working Class Marketing'
const SMS_AGENCY = 'Text or email us the video the way you usually reach us and we will turn it into the ad.'

const firstName = (s) => String(s || '').trim().split(/\s+/)[0] || ''
const when = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
const STATUS_LABEL = { new: 'New', saved: 'Saved', filmed: 'Filmed', archived: 'Set aside' }
const STATUS_STYLE = {
  new: 'bg-orange-100 text-orange-900',
  saved: 'bg-slate-200 text-slate-800',
  filmed: 'bg-green-100 text-green-900',
  archived: 'bg-slate-100 text-slate-500',
}

const chip = (on) => `rounded-full border px-4 py-2.5 text-[15px] font-semibold transition ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`

function Header({ name, token }) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#f8f7f5] ring-1 ring-slate-200">
          <img src="/brand/wc-mark.jpg" alt="The Working Class" className="h-10 w-10 object-contain" />
        </span>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-700">Video scripts</p>
          <p className="text-[15px] font-semibold text-slate-900">{name}</p>
        </div>
      </div>
      <a href={`/dashboard/${token}`} className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-[14px] font-semibold text-slate-800 hover:bg-slate-50" data-dashboard-link>
        Your numbers
      </a>
    </header>
  )
}

function Picks({ ideas, onPick, busy }) {
  if (!ideas.length) return null
  return (
    <section data-picks>
      <h2 className="text-2xl font-bold tracking-tight">Film one of these this week</h2>
      <p className="mt-1 text-[15px] text-slate-600">Picked for the time of year and what is bringing you leads. Tap one and the script is ready in about half a minute.</p>
      <div className="mt-3 space-y-3">
        {ideas.map((idea, i) => (
          <div key={idea.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-pick={idea.key}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-orange-600 text-sm font-bold text-white">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[19px] font-bold leading-snug text-slate-900">{idea.title}</p>
                <p className="mt-1 text-[15px] text-slate-600">{idea.why}</p>
                <p className="mt-1 text-[13px] text-slate-500">{LENGTHS.find((l) => l.key === idea.length)?.label || '30 seconds'}</p>
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPick(idea)}
              className="mt-3 w-full rounded-xl bg-orange-600 px-5 py-3.5 text-[17px] font-bold text-white hover:bg-orange-700 disabled:opacity-50"
              data-pick-write
            >
              Write this one for me
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

function Builder({ ask, setAsk, onWrite, busy }) {
  const [more, setMore] = useState(false)
  const set = (k, v) => setAsk((a) => ({ ...a, [k]: a[k] === v && k !== 'length' ? '' : v }))
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-builder>
      <h2 className="text-2xl font-bold tracking-tight">Or make your own</h2>
      <p className="mt-1 text-[15px] text-slate-600">Tap what it is about and how long. That is all it needs.</p>

      <p className="mt-4 text-[15px] font-semibold text-slate-800">What is it about?</p>
      <div className="mt-2 flex flex-wrap gap-2" data-topics>
        {TOPICS.map((t) => (
          <button key={t.key} type="button" onClick={() => set('topic', t.key)} className={chip(ask.topic === t.key)} title={t.hint} aria-pressed={ask.topic === t.key} data-topic={t.key}>
            {t.label}
          </button>
        ))}
      </div>
      {ask.topic && <p className="mt-2 text-[14px] text-slate-500">{TOPICS.find((t) => t.key === ask.topic)?.hint}</p>}

      <p className="mt-4 text-[15px] font-semibold text-slate-800">How long?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {LENGTHS.map((l) => (
          <button key={l.key} type="button" onClick={() => set('length', l.key)} className={chip(ask.length === l.key)} title={l.hint} aria-pressed={ask.length === l.key} data-length={l.key}>
            {l.label}
          </button>
        ))}
      </div>

      <button type="button" onClick={() => setMore((m) => !m)} className="mt-4 text-[15px] font-semibold text-orange-700 hover:text-orange-900" data-more-choices>
        {more ? 'Fewer choices' : 'More choices: who, where, tone'}
      </button>
      {more && (
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-[15px] font-semibold text-slate-800">Who is on camera?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SPEAKERS.map((s) => (
                <button key={s.key} type="button" onClick={() => set('speaker', s.key)} className={chip(ask.speaker === s.key)} aria-pressed={ask.speaker === s.key}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[15px] font-semibold text-slate-800">Where?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SETTINGS.map((s) => (
                <button key={s.key} type="button" onClick={() => set('setting', s.key)} className={chip(ask.setting === s.key)} aria-pressed={ask.setting === s.key}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[15px] font-semibold text-slate-800">Tone</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TONES.map((t) => (
                <button key={t.key} type="button" onClick={() => set('tone', t.key)} className={chip(ask.tone === t.key)} aria-pressed={ask.tone === t.key}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <label className="mt-4 block text-[15px] font-semibold text-slate-800">
        Anything to add? <span className="font-normal text-slate-500">(optional)</span>
        <textarea
          value={ask.extra}
          onChange={(e) => setAsk((a) => ({ ...a, extra: e.target.value }))}
          rows={2}
          placeholder="We are open Saturdays now. Mention the new truck."
          className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-400"
          data-extra
        />
      </label>

      <button
        type="button"
        disabled={busy || !ask.topic}
        onClick={onWrite}
        className="mt-4 w-full rounded-xl bg-slate-900 px-5 py-4 text-[18px] font-bold text-white hover:bg-slate-800 disabled:opacity-50"
        data-write
      >
        {ask.topic ? 'Write my script' : 'Tap what it is about first'}
      </button>
    </section>
  )
}

function Working({ lines }) {
  if (!lines?.length) return null
  return (
    <section className="rounded-2xl border border-green-200 bg-green-50 p-5" data-working>
      <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-green-900">What is working for you</h2>
      <ul className="mt-2 space-y-1.5">
        {lines.map((w, i) => (
          <li key={i} className="text-[16px] text-green-950">
            {w.text}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[14px] text-green-800">Your scripts lean on this.</p>
    </section>
  )
}

function Mine({ rows, onOpen }) {
  const [all, setAll] = useState(false)
  const live = rows.filter((r) => r.status !== 'archived')
  if (!live.length) return null
  const shown = all ? live : live.slice(0, 6)
  return (
    <section data-mine>
      <h2 className="text-2xl font-bold tracking-tight">Your scripts</h2>
      <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {shown.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onOpen(r)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50" data-mine-row={r.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-semibold text-slate-900">{r.script?.title || r.script?.hook}</p>
                <p className="truncate text-[13px] text-slate-500">
                  {askLabel(r.ask)} · {when(r.created_at)}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${STATUS_STYLE[r.status] || STATUS_STYLE.new}`}>{STATUS_LABEL[r.status] || 'New'}</span>
            </button>
          </li>
        ))}
      </ul>
      {live.length > 6 && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-2 text-[15px] font-semibold text-orange-700 hover:text-orange-900">
          {all ? 'Show fewer' : `Show all ${live.length}`}
        </button>
      )}
    </section>
  )
}

function SendUs({ driveUrl }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-send-us>
      <h2 className="text-xl font-bold tracking-tight">Filmed it? Send it to us</h2>
      <p className="mt-1 text-[15px] text-slate-600">One take is fine. Real beats polished. We cut it, caption it and run it.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {driveUrl && (
          <a href={driveUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-900 px-5 py-3.5 text-[16px] font-bold text-white hover:bg-slate-800" data-drive-link>
            Put it in your Drive folder
          </a>
        )}
      </div>
      <p className="mt-2 text-[15px] text-slate-600">{SMS_AGENCY}</p>
    </section>
  )
}

export default function ScriptStudioPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('home')
  const [current, setCurrent] = useState(null)
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [ask, setAsk] = useState({ topic: '', length: '30', speaker: 'owner', setting: '', tone: '', extra: '' })
  const [savingVoice, setSavingVoice] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadStudio(token)
      .then((d) => {
        if (cancelled) return
        setData(d)
        document.title = `${d.client?.name || 'Your'} video scripts`
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [token])

  const industry = data?.client?.industry || ''
  const market = data?.client?.market || ''
  const phase = useMemo(() => phaseOf({ industry, market }), [industry, market])
  const playbook = useMemo(() => playbookText(phase, { tradeWords: TRADE_WORDS[phase.trade] || 'home services', market }), [phase, market])
  const ideas = useMemo(
    () => (data ? ideasFor({ phase, working: data.working || [], has: data.has || {}, used: topicsUsedRecently(data.scripts || []) }) : []),
    [data, phase]
  )

  const landed = (row, limitLeft) => {
    setData((d) => ({ ...d, scripts: [row, ...(d?.scripts || []).filter((r) => r.id !== row.id)], ...(limitLeft !== undefined ? { limit_left: limitLeft } : {}) }))
    setCurrent(row)
    setView('script')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const write = async (a) => {
    setBusy(true)
    setBusyLabel('Writing your script… about half a minute.')
    setError('')
    try {
      const out = await writeScript(token, a, playbook)
      landed(out.script, out.limit_left)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const change = async (key, extra) => {
    if (!current) return
    setBusy(true)
    setError('')
    try {
      const out = await reviseScript(token, current.id, key, playbook, extra)
      landed(out.script, out.limit_left)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const status = async (s) => {
    if (!current) return
    try {
      const out = await setScriptStatus(token, current.id, s)
      setData((d) => ({ ...d, scripts: (d?.scripts || []).map((r) => (r.id === out.script.id ? out.script : r)) }))
      setCurrent(out.script)
      if (s === 'archived') setView('home')
    } catch (err) {
      setError(err.message)
    }
  }
  const voice = async (v) => {
    setSavingVoice(true)
    setError('')
    try {
      const out = await saveVoice(token, v)
      setData((d) => ({ ...d, voice: out.voice }))
      setView('home')
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingVoice(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBFBF8] text-slate-900">
        <div className="mx-auto max-w-xl px-4 py-16 text-center text-[17px] text-slate-600">Opening your scripts…</div>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-[#FBFBF8] text-slate-900" data-script-studio-error>
        <div className="mx-auto max-w-xl px-4 py-16">
          <h1 className="text-2xl font-bold">This link did not open</h1>
          <p className="mt-2 text-[17px] text-slate-700">{error || 'The link may be old. Ask us for a fresh one and we will send it over.'}</p>
          <p className="mt-6 text-[14px] text-slate-500">{AGENCY}</p>
        </div>
      </div>
    )
  }

  const owner = firstName(data.client?.owner)
  const name = data.client?.name || 'your company'

  return (
    <div className="min-h-screen bg-[#FBFBF8] text-slate-900" data-script-studio>
      <div className="mx-auto max-w-xl space-y-6 px-4 pb-24 pt-5">
        <Header name={name} token={token} />

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-[16px] text-red-900" data-error>
            {error}
          </div>
        )}

        {busy && view !== 'script' && (
          <div className="flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-[16px] text-orange-900" data-writing>
            <span className="inline-block h-5 w-5 flex-shrink-0 animate-spin rounded-full border-2 border-orange-300 border-t-orange-700" />
            {busyLabel}
          </div>
        )}

        {view === 'script' && current && (
          <ScriptView row={current} clientName={name} busy={busy} onBack={() => setView('home')} onChange={change} onStatus={status} />
        )}

        {view === 'voice' && <VoiceSheet voice={data.voice} saving={savingVoice} onSave={voice} onClose={() => setView('home')} />}

        {view === 'home' && (
          <>
            <section>
              <h1 className="text-3xl font-bold tracking-tight">{owner ? `Hi ${owner}.` : 'Hi.'} Here is what to film this week.</h1>
              <p className="mt-2 text-[17px] text-slate-700">
                Every script here is written from your business: your offers, your reviews, your towns, what is bringing you leads, and the time of year. Tap one, read it off your phone, film it in one take, send it to us.
              </p>
            </section>

            <Picks ideas={ideas} busy={busy} onPick={(idea) => write({ ...ask, topic: idea.topic, length: idea.length || ask.length, idea: { key: idea.key, title: idea.title, why: idea.why }, extra: '' })} />

            <Builder ask={ask} setAsk={setAsk} busy={busy} onWrite={() => write({ ...ask, idea: undefined })} />

            <Working lines={data.working} />

            <Mine rows={data.scripts || []} onOpen={(r) => landed(r)} />

            <SendUs driveUrl={data.drive_url} />

            <footer className="space-y-2 px-1 text-[14px] text-slate-500">
              <button type="button" onClick={() => setView('voice')} className="text-[15px] font-semibold text-orange-700 hover:text-orange-900" data-open-voice>
                {data.voice?.goes_by || data.voice?.tone ? 'How I talk (saved)' : 'Make them sound like me'}
              </button>
              <p>{data.limit_left !== undefined && data.limit_left < 10 ? `${data.limit_left} more scripts today. ` : ''}Questions? Reply to your Monday email and a real person answers.</p>
              <p className="text-slate-400">{AGENCY}</p>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
