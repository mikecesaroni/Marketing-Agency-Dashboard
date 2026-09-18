import { useEffect, useState } from 'react'
import { fetchMemory, forgetNote, rememberNote } from '../lib/memory'
import { Button, Card } from './ui'

/**
 * What the agency remembers about this client and about the trade at large.
 *
 * Every line here is read by the client chat and by the Ad Studio's copy
 * assistant on their next call, so "remember that the $500-off static beat
 * the video two to one" changes the next brief without anyone re-typing it.
 * Lines are written by the CRM itself (an ad paused from a Kill verdict, a
 * Scale verdict kept, a publish) and by the team, in one box.
 */
export default function MemoryPanel({ client }) {
  const [rows, setRows] = useState(null)
  const [note, setNote] = useState('')
  const [scope, setScope] = useState('client')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = () =>
    fetchMemory(client.id)
      .then(setRows)
      .catch((err) => setError(err.message))

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id])

  const add = async () => {
    if (!note.trim()) return
    setBusy(true)
    setError('')
    try {
      await rememberNote({ clientId: client.id, scope, headline: note.trim(), evidence: { client: client.name, industry: client.industry } })
      setNote('')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id) => {
    if (!confirm('Forget this? The chat and the Studio stop seeing it.')) return
    try {
      await forgetNote(id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const mine = (rows || []).filter((r) => r.scope === 'client')
  const agency = (rows || []).filter((r) => r.scope === 'account')

  const Row = ({ r }) => (
    <li className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
      <span className="min-w-0 flex-1 text-slate-800">{r.headline}</span>
      <span className="flex-shrink-0 text-[10px] text-slate-400">
        {r.evidence?.source && r.evidence.source !== 'team' ? r.evidence.source : ''} {String(r.computed_at || '').slice(0, 10)}
      </span>
      <button type="button" onClick={() => remove(r.id)} className="flex-shrink-0 text-slate-400 hover:text-red-600" title="Forget">
        ×
      </button>
    </li>
  )

  return (
    <Card padding="none" className="mt-6 p-4 md:mt-8 md:p-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900 md:text-xl">Memory</h2>
        <p className="text-xs text-slate-500">Read by the chat and the Ad Studio on every call. Pauses, wins and publishes write themselves; add anything else.</p>
      </div>

      {error && <p className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={`Remember something about ${client.name} or the trade, e.g. "the $79 tune-up static beat the video 2 to 1 on cost per lead"`}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-xs">
          <option value="client">This client</option>
          <option value="account">Whole agency</option>
        </select>
        <Button onClick={add} disabled={busy || !note.trim()}>
          {busy ? 'Saving…' : 'Remember'}
        </Button>
      </div>

      {rows === null ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {client.name} <span className="font-normal text-slate-400">{mine.length}</span>
            </p>
            {mine.length === 0 ? <p className="text-xs text-slate-400">Nothing remembered yet.</p> : <ul className="space-y-1.5">{mine.map((r) => <Row key={r.id} r={r} />)}</ul>}
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Whole agency <span className="font-normal text-slate-400">{agency.length}</span>
            </p>
            {agency.length === 0 ? <p className="text-xs text-slate-400">Nothing yet.</p> : <ul className="space-y-1.5">{agency.map((r) => <Row key={r.id} r={r} />)}</ul>}
          </div>
        </div>
      )}
    </Card>
  )
}
