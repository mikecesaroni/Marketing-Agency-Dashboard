import { useEffect, useState } from 'react'
import { CHANGES, HOW_TO_RECORD, askLabel, scriptToText, secondsFor } from '../../../supabase/functions/_shared/scriptStudio.js'
import Teleprompter from './Teleprompter'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

/**
 * One script, ready to read: the hook first, every spoken line big with
 * what to show under it, the words for the screen, the caption to post,
 * and the ways to use it (teleprompter, read it to me, copy, text it to
 * me, print). Under that, the one-tap changes and Save / Filmed.
 */
export default function ScriptView({ row, clientName, busy, onBack, onChange, onStatus }) {
  const s = row?.script || {}
  const lines = Array.isArray(s.lines) ? s.lines : []
  const [prompter, setPrompter] = useState(false)
  const [reading, setReading] = useState(false)
  const [copied, setCopied] = useState('')
  const [extra, setExtra] = useState('')
  const text = scriptToText(s, { name: clientName })
  const seconds = s.seconds || secondsFor(lines)
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  useEffect(() => () => canSpeak && window.speechSynthesis.cancel(), [canSpeak])

  const copy = async (what, label) => {
    try {
      await navigator.clipboard.writeText(what)
      setCopied(label)
      setTimeout(() => setCopied(''), 1800)
    } catch {
      setCopied('Could not copy here. Press and hold the words to copy them.')
    }
  }
  const share = async () => {
    if (canShare) {
      try {
        await navigator.share({ title: s.title || 'Video script', text })
      } catch {
        // Closed the sheet; nothing to say.
      }
    } else copy(text, 'Copied. Paste it into a text to yourself.')
  }
  const readAloud = () => {
    if (!canSpeak) return
    if (reading) {
      window.speechSynthesis.cancel()
      setReading(false)
      return
    }
    const u = new SpeechSynthesisUtterance(lines.map((l) => l.say).join(' '))
    u.rate = 1
    u.onend = () => setReading(false)
    u.onerror = () => setReading(false)
    setReading(true)
    window.speechSynthesis.speak(u)
  }
  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return copy(text, 'Pop-ups are blocked here, so it is copied instead.')
    w.document.write(`<!doctype html><title>${esc(s.title || 'Script')}</title><pre style="font:18px/1.6 -apple-system,Segoe UI,Arial,sans-serif;white-space:pre-wrap;padding:32px;max-width:720px">${esc(text)}</pre>`)
    w.document.close()
    w.focus()
    w.print()
  }

  const status = row?.status || 'new'
  const action = 'rounded-xl border border-slate-300 bg-white px-4 py-3 text-[15px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50'

  return (
    <div className="space-y-5" data-script-view data-script-id={row?.id}>
      <button type="button" onClick={onBack} className="inline-flex min-h-[44px] items-center text-[15px] font-semibold text-slate-600 hover:text-slate-900" data-script-back>
        ← Back to your scripts
      </button>

      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-700">{askLabel(row?.ask)}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{s.title || 'Your script'}</h1>
        <p className="mt-1 text-[15px] text-slate-600">
          About {seconds} seconds to say.{s.why_now ? ` ${s.why_now}` : ''}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setPrompter(true)} className="rounded-xl bg-orange-600 px-5 py-3.5 text-[17px] font-bold text-white hover:bg-orange-700" data-open-prompter>
          Teleprompter
        </button>
        {canSpeak && (
          <button type="button" onClick={readAloud} className={action} data-read-aloud>
            {reading ? 'Stop reading' : 'Read it to me'}
          </button>
        )}
        <button type="button" onClick={() => copy(text, 'Copied the whole script.')} className={action} data-copy-script>
          Copy
        </button>
        <button type="button" onClick={share} className={action} data-share-script>
          {canShare ? 'Share' : 'Text it to me'}
        </button>
        <a href={`sms:?&body=${encodeURIComponent(text)}`} className={`${action} ${canShare ? 'hidden' : 'sm:hidden'}`}>
          Open in Messages
        </a>
        <button type="button" onClick={print} className={`${action} hidden sm:inline-block`}>
          Print
        </button>
      </div>
      {copied && <p className="text-[15px] text-green-800" data-copied>{copied}</p>}

      <ol className="space-y-3" data-script-lines>
        {lines.map((l, i) => (
          <li key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className={`mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${i === 0 ? 'bg-orange-600 text-white' : 'bg-slate-900 text-white'}`}>{i + 1}</span>
              <div className="min-w-0">
                {i === 0 && <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-orange-700">The hook: first three seconds</p>}
                <p className="text-[21px] font-semibold leading-snug text-slate-900">{l.say}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {s.film_it && (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[15px] text-slate-700">
            <span className="font-semibold">Film it:</span> {s.film_it}
          </p>
        </section>
      )}

      {/* The same lines that go at the bottom of the copied text, so what
          they read here and what they paste into Notes match. */}
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4" data-how-to-record>
        <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-slate-600">How to record</p>
        <ul className="mt-2 space-y-1.5 text-[15px] text-slate-700">
          {HOW_TO_RECORD.map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>

      {s.caption && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-slate-600">Caption to post with it</p>
            <button type="button" onClick={() => copy(s.caption, 'Copied the caption.')} className="-my-2 -mr-2 inline-flex min-h-[44px] items-center px-2 text-[14px] font-semibold text-orange-700 hover:text-orange-900" data-copy-caption>
              Copy
            </button>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-[16px] text-slate-800">{s.caption}</p>
        </section>
      )}

      <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4" data-script-changes>
        <p className="text-[15px] font-bold text-orange-900">Not quite you? One tap and it is rewritten.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {CHANGES.map((c) => (
            <button key={c.key} type="button" disabled={busy} onClick={() => onChange(c.key, extra)} className="rounded-full border border-orange-300 bg-white px-4 py-2.5 text-[15px] font-semibold text-orange-900 hover:bg-orange-100 disabled:opacity-50" data-change={c.key}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="Or say what to change: mention we are open Saturdays"
            className="flex-1 rounded-xl border border-orange-300 bg-white px-4 py-3 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-400"
            data-change-extra
          />
          <button type="button" disabled={busy || !extra.trim()} onClick={() => onChange('', extra)} className="rounded-xl bg-slate-900 px-5 py-3 text-[15px] font-bold text-white hover:bg-slate-800 disabled:opacity-50" data-change-go>
            Rewrite
          </button>
        </div>
        {busy && <p className="mt-2 text-[14px] text-orange-800">Rewriting… about half a minute. The old one stays in your list.</p>}
      </section>

      <section className="space-y-2" data-script-status>
        <div className="flex flex-wrap items-center gap-2">
          {status !== 'filmed' && (
            <button type="button" onClick={() => onStatus('filmed')} className="rounded-xl bg-green-700 px-5 py-3.5 text-[17px] font-bold text-white hover:bg-green-800" data-mark-filmed>
              I filmed this
            </button>
          )}
          {status === 'filmed' && <span className="rounded-xl bg-green-100 px-4 py-3 text-[15px] font-bold text-green-900">Filmed. Send us the video and we take it from here.</span>}
          {status !== 'archived' && (
            <button type="button" onClick={() => onStatus('archived')} className="ml-auto inline-flex min-h-[44px] items-center px-2 text-[14px] text-slate-500 underline hover:text-slate-800" data-mark-archived>
              Not for me
            </button>
          )}
        </div>
        {/* Every script is kept the moment it is written; nothing to save. */}
        <p className="text-[14px] text-slate-500" data-autosaved>
          Saved to your scripts automatically. Close this and it is still here when you come back.
        </p>
      </section>

      {prompter && <Teleprompter lines={lines} title={s.title} onClose={() => setPrompter(false)} />}
    </div>
  )
}
