import { useEffect, useMemo, useRef, useState } from 'react'
import { buildBrief } from '../lib/clientBrief'
import {
  clearChat,
  extractCreativeSets,
  fetchChatHistory,
  renderBlocks,
  sendChatMessage,
} from '../lib/clientChat'
import { copyText } from '../lib/intakeSummary'

// Starters for the things actually asked for most often, so the blank box
// isn't the first thing you have to solve.
const STARTERS = [
  'Make me a new ad for swap outs',
  "What's working and what should I cut?",
  'Write 5 hooks I have not tested yet',
  'Build this week’s report',
]

function Bubble({ role, text }) {
  const mine = role === 'user'
  const sets = useMemo(() => (mine ? null : extractCreativeSets(text)), [mine, text])

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
          mine ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'
        }`}
      >
        {text}
        {sets && (
          <div className="mt-2 pt-2 border-t border-slate-300">
            <p className="text-[11px] font-semibold text-slate-600">
              {sets.length} creative {sets.length === 1 ? 'set' : 'sets'} detected
            </p>
            <p className="text-[11px] text-slate-500">
              {sets.map((s) => s.hook_angle).filter(Boolean).join(' · ')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ClientChatPanel({ client, intake, ads }) {
  const [messages, setMessages] = useState([])
  const [chatId, setChatId] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  // Rebuilt every render from current CRM data, so the model is never working
  // from a snapshot taken when the conversation started.
  const brief = useMemo(() => buildBrief({ client, intake, ads }), [client, intake, ads])

  useEffect(() => {
    fetchChatHistory(client.id)
      .then(({ chatId: id, messages: rows }) => {
        setChatId(id)
        setMessages(rows.map((m) => ({ role: m.role, text: renderBlocks(m.content) })))
      })
      .catch((err) => setError(err.message))
  }, [client.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const send = async (text) => {
    const trimmed = (text ?? input).trim()
    if (!trimmed || sending) return

    setInput('')
    setError('')
    setMessages((m) => [...m, { role: 'user', text: trimmed }])
    setSending(true)

    try {
      const res = await sendChatMessage({
        clientId: client.id,
        chatId,
        system: brief,
        message: trimmed,
      })
      setChatId(res.chat_id)
      setMessages((m) => [...m, { role: 'assistant', text: renderBlocks(res.content) }])
    } catch (err) {
      setError(err.message)
      // Put the message back so a failed send isn't lost work.
      setInput(trimmed)
      setMessages((m) => m.slice(0, -1))
    } finally {
      setSending(false)
    }
  }

  const handleClear = async () => {
    await clearChat(client.id)
    setMessages([])
    setChatId(null)
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')

  return (
    <div className="flex flex-col h-[70vh]">
      {error && (
        <div className="p-3 mb-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.length === 0 && !sending && (
          <div className="text-center py-6">
            <p className="text-sm text-slate-600 mb-1">
              This chat already knows everything about {client.name}.
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Intake, offers, budget, and what is currently running in the ad account.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="px-3 py-1.5 rounded-full border border-slate-300 text-xs text-slate-700 hover:bg-slate-50 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.text} />
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-slate-100 text-slate-500 rounded-lg px-3 py-2 text-sm italic">
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="pt-3 border-t border-slate-200 mt-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={2}
            placeholder={`Ask anything about ${client.name}...`}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => send()}
            disabled={sending || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition self-end"
          >
            Send
          </button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-slate-400">Enter to send, Shift+Enter for a new line</span>
          <div className="flex gap-3">
            {lastAssistant && (
              <button
                onClick={() => copyText(lastAssistant.text)}
                className="text-[11px] text-blue-600 hover:text-blue-800"
              >
                Copy last reply
              </button>
            )}
            {messages.length > 0 && (
              <button onClick={handleClear} className="text-[11px] text-slate-500 hover:text-red-600">
                Clear chat
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
