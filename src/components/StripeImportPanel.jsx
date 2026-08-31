import { useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { money } from '../lib/queries'
import {
  applyImportedPayment,
  fetchImportedChargeIds,
  fetchRecordedAmounts,
  recordedKey,
  guessType,
  normaliseStripeCsv,
  suggestClient,
} from '../lib/stripeImport'

// Payments made before the webhook existed never reached it, so a CSV export is
// the only way in. Everything is proposed and nothing is written until it is
// chosen: the export covers the whole Stripe account, and some of it belongs to
// another business entirely.
export default function StripeImportPanel({ clients, onDone }) {
  const [rows, setRows] = useState(null)
  const [mapping, setMapping] = useState({})
  const [types, setTypes] = useState({})
  const [imported, setImported] = useState(new Set())
  // Payments already on the books, keyed by client + amount + day. Catches the
  // same payment arriving under an identifier the id check cannot match.
  const [recorded, setRecorded] = useState(new Set())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)

  const read = async (file) => {
    if (!file) return
    setError('')
    setDone('')
    try {
      const text = await file.text()
      const { rows: parsed, error: parseError } = normaliseStripeCsv(text)
      // The parser explains an empty result itself, naming the statuses and
      // columns it saw, which is the difference between fixing the export and
      // guessing at it.
      if (parseError) throw new Error(parseError)
      if (parsed.length === 0) throw new Error('No settled payments found in that file.')

      const [{ data: intakes }, already, onBooks] = await Promise.all([
        supabase.from('onboarding_intake').select('client_id, contact_email'),
        fetchImportedChargeIds(),
        fetchRecordedAmounts(),
      ])
      setRecorded(onBooks)

      const guessedClients = {}
      const guessedTypes = {}
      for (const row of parsed) {
        const s = suggestClient(row, clients, intakes || [])
        guessedClients[row.id] = s
        const c = clients.find((x) => x.id === s.id)
        guessedTypes[row.id] = guessType(row, c)
      }
      setRows(parsed)
      setMapping(guessedClients)
      setTypes(guessedTypes)
      setImported(already)
    } catch (err) {
      setError(err.message)
    }
  }

  const save = async () => {
    setBusy(true)
    setError('')
    let count = 0
    try {
      for (const row of rows) {
        const clientId = mapping[row.id]?.id
        // Blank means "not this business" — the default, so nothing is
        // imported by accident.
        if (!clientId || imported.has(row.id)) continue
        await applyImportedPayment({ row, clientId, type: types[row.id] || 'monthly' })
        count++
      }
      setDone(`Imported ${count} ${count === 1 ? 'payment' : 'payments'}.`)
      setRows(null)
      if (fileRef.current) fileRef.current.value = ''
      onDone?.()
    } catch (err) {
      setError(`${err.message}${count ? ` (${count} imported before this failed)` : ''}`)
    } finally {
      setBusy(false)
    }
  }

  // A warning rather than a skip: two genuine identical charges on one day are
  // possible, so this says what it sees and leaves the call to a person.
  const looksRecorded = (row, clientId) =>
    Boolean(clientId) && recorded.has(recordedKey(clientId, row.amount, row.date))

  const chosen = rows ? rows.filter((r) => mapping[r.id]?.id && !imported.has(r.id)).length : 0
  const warned = rows
    ? rows.filter((r) => !imported.has(r.id) && looksRecorded(r, mapping[r.id]?.id)).length
    : 0

  return (
    <div className="pt-3 border-t border-slate-200">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">Import past payments</h3>
      <p className="text-xs text-slate-500 mb-2">
        Stripe only sends events created after the endpoint existed, so anything older has to come
        from a CSV. In Stripe go to Payments, then Export, and upload the file here.
      </p>

      {error && (
        <div className="p-3 mb-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
      {done && (
        <div className="p-3 mb-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          {done}
        </div>
      )}

      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          // Ignore anything that is not the export: dropping a PDF here should
          // say so rather than being read as an empty CSV.
          const file = e.dataTransfer.files?.[0]
          if (!file) return
          if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
            setError(`${file.name} is not a CSV. Export payments from Stripe as CSV.`)
            return
          }
          read(file)
        }}
        className={`block rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition ${
          dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <p className="text-sm text-slate-600">
          Drop the CSV here, or <span className="text-blue-600 font-medium">choose a file</span>
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => read(e.target.files?.[0])}
          className="hidden"
        />
      </label>

      {rows && (
        <div className="mt-3">
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-700">
                {rows.length} settled {rows.length === 1 ? 'payment' : 'payments'} found
              </p>
              <p className="text-[11px] text-slate-500">
                Leave a row unassigned to skip it
              </p>
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
              {rows.map((row) => {
                const isDone = imported.has(row.id)
                const guess = mapping[row.id]
                return (
                  <div
                    key={row.id}
                    className={`flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 ${
                      isDone ? 'bg-slate-50 opacity-60' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {money(row.amount)}
                        <span className="ml-2 font-normal text-slate-500">{row.date}</span>
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {row.email || row.customerId || 'no email on the charge'}
                        {row.description && ` · ${row.description}`}
                      </p>
                      {guess?.via && !isDone && (
                        <p className="text-[11px] text-blue-600">Suggested: {guess.via}</p>
                      )}
                      {!isDone && looksRecorded(row, guess?.id) && (
                        <p className="text-[11px] font-medium text-amber-700">
                          A {money(row.amount)} payment is already recorded for this client on{' '}
                          {row.date} — importing it again would double-count it.
                        </p>
                      )}
                    </div>

                    {isDone ? (
                      <span className="text-[11px] text-slate-500 flex-shrink-0">
                        already imported
                      </span>
                    ) : (
                      <div className="flex gap-1.5 flex-shrink-0">
                        <select
                          value={mapping[row.id]?.id || ''}
                          onChange={(e) =>
                            setMapping((m) => ({ ...m, [row.id]: { id: e.target.value, via: '' } }))
                          }
                          className="px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                        >
                          <option value="">Not this business</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                              {c.archived ? ' (archived)' : ''}
                            </option>
                          ))}
                        </select>
                        <select
                          value={types[row.id] || 'monthly'}
                          onChange={(e) => setTypes((t) => ({ ...t, [row.id]: e.target.value }))}
                          className="px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                        >
                          <option value="monthly">Monthly</option>
                          <option value="setup">Setup</option>
                        </select>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={save}
              disabled={busy || chosen === 0}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {busy ? 'Importing...' : `Import ${chosen} mapped ${chosen === 1 ? 'payment' : 'payments'}`}
            </button>
            <button
              onClick={() => setRows(null)}
              className="text-[11px] text-slate-500 hover:text-slate-800"
            >
              Cancel
            </button>
            {warned > 0 && (
              <span className="text-[11px] font-medium text-amber-700">
                {warned} of these {warned === 1 ? 'looks' : 'look'} already recorded — unassign
                {warned === 1 ? ' it' : ' them'} unless you know the charge really happened twice.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
