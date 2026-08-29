import { useEffect, useMemo, useRef, useState } from 'react'
import { buildBrief } from '../lib/clientBrief'
import {
  clearChat,
  creativeSetToStudio,
  extractCreativeSets,
  fetchChatHistory,
  imageUrls,
  renderBlocks,
  sendChatMessage,
} from '../lib/clientChat'
import {
  MAX_ATTACHMENTS,
  imagesFromDataTransfer,
  isImageFile,
  prepareImage,
  uploadChatImage,
} from '../lib/chatImages'
import { copyText } from '../lib/intakeSummary'
import { extractTasksFromChat, taskTrigger } from '../lib/clientTasks'

// Starters for the things actually asked for most often, so the blank box
// isn't the first thing you have to solve.
const STARTERS = [
  'Make me a new ad for swap outs',
  "What's working and what should I cut?",
  'Write 5 hooks I have not tested yet',
  'Build this week’s report',
]

// One detected creative set, ready to hand straight to the compositor. The
// point of this card is that nothing here gets re-typed: the hook, offer and
// CTA the model wrote are the ones the artboard paints.
function CreativeSetCard({ set, index, onUse }) {
  const mapped = useMemo(() => creativeSetToStudio(set), [set])

  return (
    <div className="rounded-md border border-slate-300 bg-white p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-700">
            {mapped.hookAngle || `Set ${index + 1}`}
          </p>
          <p className="text-[11px] text-slate-500 truncate">{mapped.hook || '(no headline)'}</p>
        </div>
        {mapped.isVideo ? (
          <span className="flex-shrink-0 px-2 py-1 rounded bg-slate-100 text-slate-500 text-[11px] font-medium">
            🎬 Video script
          </span>
        ) : (
          onUse && (
            <button
              onClick={() => onUse(mapped)}
              className="flex-shrink-0 px-2 py-1 rounded bg-orange-600 text-white text-[11px] font-medium hover:bg-orange-700 transition"
            >
              Open in Ad Studio
            </button>
          )
        )}
      </div>
    </div>
  )
}

function Bubble({ role, text, images, onUseSet }) {
  const mine = role === 'user'
  const sets = useMemo(() => (mine ? null : extractCreativeSets(text)), [mine, text])
  const shots = images || []

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
          mine ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'
        }`}
      >
        {shots.length > 0 && (
          <div className={`flex flex-wrap gap-1.5 ${text ? 'mb-2' : ''}`}>
            {shots.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img
                  src={url}
                  alt="Attached screenshot"
                  className="max-h-40 rounded border border-white/30 object-cover"
                />
              </a>
            ))}
          </div>
        )}
        {text}
        {sets && sets.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-300 space-y-1.5">
            <p className="text-[11px] font-semibold text-slate-600">
              {sets.length} creative {sets.length === 1 ? 'set' : 'sets'} ready to build
            </p>
            {sets.map((s, i) => (
              <CreativeSetCard key={i} set={s} index={i} onUse={onUseSet} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ClientChatPanel({
  client,
  intake,
  ads,
  onUseCreativeSet,
  onTasksAdded,
  autoPrompt,
}) {
  const [messages, setMessages] = useState([])
  const [chatId, setChatId] = useState(null)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  // Screenshots staged for the next message: { id, name, previewUrl, prepared }.
  const [attachments, setAttachments] = useState([])
  const [dragging, setDragging] = useState(false)
  const [taskNote, setTaskNote] = useState('')
  const bottomRef = useRef(null)
  const fileRef = useRef(null)
  // Drag events fire on every child element, so a plain boolean flickers as the
  // pointer crosses the bubbles. Counting enter/leave is what keeps it steady.
  const dragDepth = useRef(0)
  // Stops two extraction passes overlapping if a reply lands while the
  // previous one is still reading the transcript.
  const extractingRef = useRef(false)
  // Fires the seeded question once per open, not once per render — the panel
  // remounts fresh every time the modal opens (Modal unmounts its children on
  // close), so this only needs to survive one mount's worth of re-renders.
  const autoSentRef = useRef(false)

  // Rebuilt every render from current CRM data, so the model is never working
  // from a snapshot taken when the conversation started.
  const brief = useMemo(() => buildBrief({ client, intake, ads }), [client, intake, ads])

  useEffect(() => {
    fetchChatHistory(client.id)
      .then(({ chatId: id, messages: rows }) => {
        setChatId(id)
        setMessages(
          rows.map((m) => ({
            role: m.role,
            text: renderBlocks(m.content),
            images: imageUrls(m.content),
          }))
        )
      })
      .catch((err) => setError(err.message))
      .finally(() => setHistoryLoaded(true))
  }, [client.id])

  // Waits for history so the seeded question lands after whatever was already
  // said, rather than racing the history fetch and getting overwritten by it.
  useEffect(() => {
    if (!autoPrompt || !historyLoaded || autoSentRef.current) return
    autoSentRef.current = true
    send(autoPrompt)
    // send() is recreated every render; the ref guard is what keeps this to
    // one call, so it does not need to be a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrompt, historyLoaded])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  // Object URLs are the thumbnails; without this every dropped screenshot stays
  // in memory for as long as the tab is open.
  useEffect(() => {
    return () => attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl))
    // Intentionally on unmount only. Revoking on every change would kill the
    // preview of an attachment that is still staged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addFiles = async (files) => {
    const images = [...files].filter(isImageFile)
    if (images.length === 0) return
    setError('')

    const room = MAX_ATTACHMENTS - attachments.length
    if (room <= 0) {
      setError(`You can attach up to ${MAX_ATTACHMENTS} screenshots per message`)
      return
    }
    if (images.length > room) {
      setError(`Only the first ${room} were attached. Limit is ${MAX_ATTACHMENTS} per message.`)
    }

    for (const file of images.slice(0, room)) {
      try {
        // Shrunk here rather than on upload: a 4K screenshot is several MB of
        // pixels Claude would only scale back down anyway.
        const prepared = await prepareImage(file)
        setAttachments((a) => [
          ...a,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name || 'Screenshot',
            previewUrl: URL.createObjectURL(prepared.blob),
            prepared,
          },
        ])
      } catch (err) {
        setError(err.message)
      }
    }
  }

  const removeAttachment = (id) => {
    setAttachments((a) => {
      const hit = a.find((x) => x.id === id)
      if (hit) URL.revokeObjectURL(hit.previewUrl)
      return a.filter((x) => x.id !== id)
    })
  }

  const onDrop = (e) => {
    const images = imagesFromDataTransfer(e.dataTransfer)
    dragDepth.current = 0
    setDragging(false)
    if (images.length === 0) return
    e.preventDefault()
    addFiles(images)
  }

  const onDragEnter = (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return
    dragDepth.current += 1
    setDragging(true)
  }

  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  const onPaste = (e) => {
    // A screenshot from the OS clipboard arrives here, not through the drop
    // handler, and it is the fastest way to get one into the chat.
    const images = imagesFromDataTransfer(e.clipboardData)
    if (images.length === 0) return
    e.preventDefault()
    addFiles(images)
  }

  // Runs on the turns that are actually about work to be done: a call summary
  // pasted in, or somebody saying outright to make a task of something.
  //
  // It used to run on every turn, and that is what buried the task list. Most
  // of what happens in this chat is asking questions -- rewrite this hook, what
  // should the budget be, why did that ad fail -- and an extraction pass reads
  // every one of those as an intention to do something. Nobody committed to
  // anything; they were thinking out loud.
  //
  // The sweep over the whole history still exists, on the button on the client
  // page, where somebody has decided they want it.
  //
  // Fired without awaiting: it reads from the DB, so it needs nothing send() is
  // holding, and the reply on screen should not wait on it.
  const autoExtract = (text) => {
    const reason = taskTrigger(text)
    if (!reason) return
    if (extractingRef.current) return
    extractingRef.current = true
    extractTasksFromChat(client.id, { focus: text, reason })
      .then((res) => {
        if (res.inserted > 0) {
          onTasksAdded?.(res.tasks)
          setTaskNote(`+${res.inserted} task${res.inserted === 1 ? '' : 's'} added to the task list`)
          setTimeout(() => setTaskNote(''), 5000)
        }
      })
      // Silent on failure — a missed pass here just means the next message
      // triggers another, not a broken chat.
      .catch(() => {})
      .finally(() => {
        extractingRef.current = false
      })
  }

  const send = async (text) => {
    const trimmed = (text ?? input).trim()
    const staged = attachments
    if ((!trimmed && staged.length === 0) || sending) return

    setInput('')
    setError('')
    setAttachments([])
    setMessages((m) => [
      ...m,
      { role: 'user', text: trimmed, images: staged.map((a) => a.previewUrl) },
    ])
    setSending(true)

    try {
      const uploaded = []
      for (let i = 0; i < staged.length; i++) {
        uploaded.push(await uploadChatImage(client.id, staged[i].prepared, i))
      }

      const res = await sendChatMessage({
        clientId: client.id,
        chatId,
        system: brief,
        message: trimmed,
        images: uploaded.map((u) => ({ url: u.url, media_type: u.mediaType })),
      })
      setChatId(res.chat_id)
      // Swap the local blob previews for the stored URLs, so the thumbnails
      // survive a reload instead of turning into broken images.
      if (uploaded.length > 0) {
        setMessages((m) =>
          m.map((msg, i) =>
            i === m.length - 1 ? { ...msg, images: uploaded.map((u) => u.url) } : msg
          )
        )
        staged.forEach((a) => URL.revokeObjectURL(a.previewUrl))
      }
      setMessages((m) => [...m, { role: 'assistant', text: renderBlocks(res.content) }])
      autoExtract(trimmed)
    } catch (err) {
      setError(err.message)
      // Put the message back so a failed send isn't lost work.
      setInput(trimmed)
      setAttachments(staged)
      setMessages((m) => m.slice(0, -1))
    } finally {
      setSending(false)
    }
  }

  const handleClear = async () => {
    await clearChat(client.id)
    attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl))
    setAttachments([])
    setMessages([])
    setChatId(null)
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')

  const canSend = Boolean(input.trim()) || attachments.length > 0

  return (
    <div
      className="relative flex flex-col h-[70vh]"
      onDragEnter={onDragEnter}
      onDragOver={(e) => {
        // Without this the browser navigates to the dropped file instead of
        // giving it to us.
        if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault()
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-blue-500 bg-blue-50/90 pointer-events-none">
          <p className="text-sm font-medium text-blue-700">Drop screenshots here</p>
        </div>
      )}

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
          <Bubble
            key={i}
            role={m.role}
            text={m.text}
            images={m.images}
            onUseSet={onUseCreativeSet}
          />
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
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((a) => (
              <div key={a.id} className="relative">
                <img
                  src={a.previewUrl}
                  alt={a.name}
                  className="h-16 w-16 rounded border border-slate-300 object-cover"
                />
                <button
                  onClick={() => removeAttachment(a.id)}
                  aria-label={`Remove ${a.name}`}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-slate-800 text-white text-xs leading-none hover:bg-red-600 transition"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files)
              // Reset, or picking the same screenshot twice in a row is ignored.
              e.target.value = ''
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            title="Attach a screenshot"
            aria-label="Attach a screenshot"
            className="px-3 py-2 border border-slate-300 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition self-end"
          >
            📎
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={onPaste}
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
            disabled={sending || !canSend}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition self-end"
          >
            Send
          </button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className={`text-[11px] ${taskNote ? 'text-green-600 font-medium' : 'text-slate-400'}`}>
            {taskNote || 'Enter to send. Drop or paste a screenshot to attach it.'}
          </span>
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
