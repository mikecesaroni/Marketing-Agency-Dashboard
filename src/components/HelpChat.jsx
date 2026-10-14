import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { renderBlocks } from '../lib/clientChat'
import { findHelpTool, helpPageState, runHelpTool, listHelpTools, setHelpPage } from '../lib/helpActions'
import { globalHelpTools } from '../lib/helpGlobalActions'
import { HELP_SUGGESTIONS, buildHelpBrief, pageContextText, toolLabel } from '../lib/helpBrief'
import { fetchHelpHistory, rememberHelpChat, rememberedHelpChat, sendHelpMessage, sendHelpToolResults } from '../lib/helpChatStore'

/**
 * The help chat: a sticky button at the bottom right of every CRM page.
 *
 * Ask it how to do something and it answers from the guide. Ask it to do
 * something and it does it through the tools the page in front of you
 * registers (see useHelpActions): open a client's Studio writing three ads,
 * tick the newest static on the publish page, set the budget, press Publish.
 * "Finish what I started" is a look at the page followed by the steps that
 * are left.
 *
 * Mounted once in App, outside the routes, so a conversation survives the
 * page changes its own tools cause. The chat id lives in localStorage and the
 * turns in help_messages, so a reload picks the conversation back up.
 */

// How many rounds of tool calls one message may take before the chat stops
// and asks to go on. A publish is about six; twelve leaves room.
const MAX_ROUNDS = 12

// Pages the chat must never appear on: what a client or an owner opens.
const PUBLIC = /^\/(onboarding|approve|report|login)(\/|$)|^\/dashboard\/[^/]+/

/** The stored turns as the transcript shows them. */
function transcriptFrom(rows) {
  const out = []
  for (const m of rows) {
    const content = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content || '') }]
    if (m.role === 'user') {
      // The last text block is what the person typed; the one before it, if
      // any, is the "Where I am" block, which the transcript does not repeat.
      const texts = content.filter((b) => b.type === 'text')
      const typed = texts[texts.length - 1]?.text
      if (typed && !/^Where I am: /.test(typed)) out.push({ role: 'user', text: typed })
      continue
    }
    const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n').trim()
    const calls = content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, label: toolLabel(b.name, b.input) }))
    if (text || calls.length) out.push({ role: 'assistant', text, calls })
  }
  return out
}

export default function HelpChat() {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [chatId, setChatId] = useState(() => rememberedHelpChat())
  const [items, setItems] = useState(null) // transcript
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  // A tool that needs a yes before it runs: {label, text, resolve}.
  const [confirm, setConfirm] = useState(null)
  const bottom = useRef(null)
  const input = useRef(null)
  const system = useMemo(() => buildHelpBrief(), [])
  const globals = useMemo(() => globalHelpTools({ navigate }), [navigate])

  // Where the user is, for page_state and the "Where I am" block.
  useEffect(() => {
    setHelpPage({ path: location.pathname + location.search, title: document.title || '' })
  }, [location.pathname, location.search])

  // The conversation so far, once the panel opens.
  useEffect(() => {
    if (!open || items !== null) return
    if (!chatId) {
      setItems([])
      return
    }
    fetchHelpHistory(chatId)
      .then((rows) => setItems(transcriptFrom(rows)))
      .catch(() => setItems([]))
  }, [open, chatId, items])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [items, busy, confirm, open])

  if (PUBLIC.test(location.pathname)) return null

  const push = (item) => setItems((cur) => [...(cur || []), item])
  const patchLast = (fn) => setItems((cur) => {
    const next = [...(cur || [])]
    const i = next.length - 1
    if (i >= 0) next[i] = fn(next[i])
    return next
  })

  const askToConfirm = (tool, call) =>
    new Promise((resolve) => {
      setConfirm({
        label: toolLabel(call.name, call.input),
        text: tool.confirmText || 'Go ahead?',
        resolve: (yes) => {
          setConfirm(null)
          resolve(yes)
        },
      })
    })

  // One assistant reply: show it, run its tools, send the results, repeat.
  const handleReply = async (data, id) => {
    let reply = data
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const content = Array.isArray(reply?.content) ? reply.content : []
      const text = renderBlocks(content.filter((b) => b.type === 'text'))
      const calls = content.filter((b) => b.type === 'tool_use')
      push({ role: 'assistant', text, calls: calls.map((c) => ({ id: c.id, label: toolLabel(c.name, c.input), pending: true })) })
      if (reply.stop_reason !== 'tool_use' || calls.length === 0) return

      const results = []
      for (const call of calls) {
        const tool = findHelpTool(call.name, globals)
        let out
        if (tool?.confirm) {
          const yes = await askToConfirm(tool, call)
          out = yes ? await runHelpTool(call.name, call.input, globals) : { error: 'The user said not now. Do not run this again unless they ask.' }
        } else {
          setBusy(toolLabel(call.name, call.input))
          out = await runHelpTool(call.name, call.input, globals)
        }
        const failed = Boolean(out && typeof out === 'object' && out.error)
        patchLast((m) => ({ ...m, calls: (m.calls || []).map((c) => (c.id === call.id ? { ...c, pending: false, failed, note: failed ? out.error : out?.note || '' } : c)) }))
        results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(out).slice(0, 30000), ...(failed ? { is_error: true } : {}) })
      }
      setBusy('Thinking…')
      // Fresh context after the tools ran, from wherever they took us.
      const context = pageContextText(helpPageState())
      reply = await sendHelpToolResults({ chatId: id, system, results, context, tools: listHelpTools(globals) })
    }
    push({ role: 'assistant', text: `Stopped after ${MAX_ROUNDS} steps. Say "carry on" to continue.`, calls: [] })
  }

  const send = async (text) => {
    const message = String(text || '').trim()
    if (!message || busy) return
    setDraft('')
    setError('')
    push({ role: 'user', text: message })
    setBusy('Thinking…')
    try {
      const context = pageContextText(helpPageState())
      const data = await sendHelpMessage({ chatId, system, message, context, tools: listHelpTools(globals) })
      const id = data.chat_id || chatId
      if (id !== chatId) {
        setChatId(id)
        rememberHelpChat(id)
      }
      await handleReply(data, id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const newChat = () => {
    setChatId('')
    rememberHelpChat('')
    setItems([])
    setError('')
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(draft)
    }
  }

  return (
    <>
      {/* THE BUTTON. Above the phone's tab bar, clear of the Studio frame. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close help' : 'Open help'}
        aria-expanded={open}
        data-help-button
        className={`fixed bottom-20 right-4 z-[60] flex h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold shadow-lg transition md:bottom-6 md:right-6 ${
          open ? 'bg-slate-700 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'
        }`}
      >
        <span aria-hidden="true" className={busy ? 'animate-pulse' : ''}>✦</span>
        {open ? 'Close' : 'Help'}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Help"
          data-help-panel
          className="fixed bottom-36 right-4 z-[60] flex h-[min(34rem,calc(100vh-11rem))] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl md:bottom-20 md:right-6"
        >
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-sm font-semibold text-slate-900">Help</p>
            <p className="truncate text-[11px] text-slate-500">asks the guide, or does it for you</p>
            <button type="button" onClick={newChat} className="ml-auto text-[11px] text-slate-500 underline hover:text-slate-800" data-help-new>
              New chat
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
            {items === null && <p className="text-xs text-slate-500">Loading…</p>}
            {items?.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-600">
                  Ask how to do anything in the CRM, or ask for it to be done: it can open pages, make ads, fill in the publish page and press the buttons for you.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {HELP_SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-50" data-help-suggestion>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {(items || []).map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="ml-8 rounded-2xl rounded-br-sm bg-slate-900 px-3 py-2 text-white" data-help-user>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                </div>
              ) : (
                <div key={i} className="mr-6 space-y-1" data-help-assistant>
                  {(m.calls || []).map((c) => (
                    <p key={c.id} className={`text-[11px] ${c.failed ? 'text-red-700' : 'text-slate-500'}`} data-help-call data-pending={c.pending ? '1' : '0'}>
                      {c.pending ? '…' : c.failed ? '✕' : '✓'} {c.label}
                      {c.note ? <span className="text-slate-400">: {String(c.note).slice(0, 160)}</span> : null}
                    </p>
                  ))}
                  {m.text && (
                    <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-slate-900">
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    </div>
                  )}
                </div>
              )
            )}
            {confirm && (
              <div className="mr-6 rounded-xl border border-orange-300 bg-orange-50 p-3" data-help-confirm>
                <p className="text-sm font-semibold text-orange-900">{confirm.label}</p>
                <p className="mt-0.5 text-xs text-orange-900">{confirm.text}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => confirm.resolve(true)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800" data-help-confirm-yes>
                    Do it
                  </button>
                  <button type="button" onClick={() => confirm.resolve(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50" data-help-confirm-no>
                    Not now
                  </button>
                </div>
              </div>
            )}
            {busy && !confirm && (
              <p className="text-[11px] text-slate-500" data-help-busy>
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-slate-400" /> {busy}
              </p>
            )}
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700" data-help-error>
                {error}
              </p>
            )}
            <div ref={bottom} />
          </div>

          <div className="border-t border-slate-200 p-2">
            <div className="flex items-end gap-2">
              <textarea
                ref={input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
                rows={2}
                placeholder="Ask, or say what to do…"
                className="flex-1 resize-none rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                data-help-input
              />
              <button
                type="button"
                onClick={() => send(draft)}
                disabled={busy !== '' || !draft.trim()}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                data-help-send
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
