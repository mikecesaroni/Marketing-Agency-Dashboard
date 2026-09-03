import { useState } from 'react'
import Modal from './Modal'
import Button from './ui/Button'
import { supabase } from '../lib/supabaseClient'
import {
  attachedRows,
  blockers,
  canDelete,
  nameMatches,
  readyToDelete,
  rowsDestroyed,
  rowsKept,
} from '../lib/clientDelete'

async function fetchDeletePreview(clientId) {
  const { data, error } = await supabase.rpc('client_delete_preview', { p_client_id: clientId })
  if (error) throw error
  return data
}

/**
 * Passes the name the screen was showing, so the database can refuse if the
 * page is stale and that id now belongs to somebody else.
 */
async function deleteClientPermanently(clientId, name) {
  const { data, error } = await supabase.rpc('delete_client_permanently', {
    p_client_id: clientId,
    p_expect_name: name,
  })
  if (error) throw error
  return data
}

/**
 * Permanent delete, shown only on an archived client.
 *
 * The whole design is "show the damage first". The preview comes from the
 * database by walking the foreign keys, so it lists what is actually attached
 * rather than what somebody remembered to hardcode -- and it is fetched when
 * the dialog opens, not from stale page state.
 */
export default function DeleteClientButton({ client, onDeleted }) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const openDialog = async () => {
    setOpen(true)
    setTyped('')
    setError('')
    setPreview(null)
    try {
      setPreview(await fetchDeletePreview(client.id))
    } catch (err) {
      setError(err.message)
    }
  }

  const run = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await deleteClientPermanently(client.id, client.name)
      setOpen(false)
      onDeleted?.(result)
    } catch (err) {
      setError(err.message)
      // Re-read: whatever refused the delete is a fact about the data, and the
      // reason may have changed since the dialog opened.
      try {
        setPreview(await fetchDeletePreview(client.id))
      } catch {
        /* the original error is the one worth showing */
      }
    } finally {
      setBusy(false)
    }
  }

  const stopping = preview ? blockers(preview) : []
  const destroyed = preview ? rowsDestroyed(preview) : 0
  const kept = preview ? rowsKept(preview) : []

  return (
    <>
      <Button variant="ghost" size="sm" onClick={openDialog} className="text-red-600 hover:bg-red-50">
        Delete permanently
      </Button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={`Delete ${client.name}?`}>
        {error && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {!preview && !error && <p className="text-sm text-slate-500">Checking what is attached…</p>}

        {preview && (
          <>
            {stopping.length > 0 ? (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-semibold text-amber-900 mb-1">
                  This client cannot be deleted.
                </p>
                <ul className="text-sm text-amber-800 list-disc pl-5 space-y-1">
                  {stopping.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
                <p className="text-xs text-amber-700 mt-2">
                  Archived is the right place for a client with history — it keeps the books intact
                  and hides them from MRR, the Meta sync and every list.
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-700 mb-3">
                This cannot be undone. {destroyed > 0
                  ? `${destroyed} row${destroyed === 1 ? '' : 's'} will be deleted along with the client.`
                  : 'Nothing else is attached to this client.'}
              </p>
            )}

            {attachedRows(preview).length > 0 && (
              <div className="mb-4 border border-slate-200 rounded-lg divide-y divide-slate-100">
                {attachedRows(preview).map((r) => (
                  <div key={r.table} className="flex items-baseline justify-between gap-3 px-3 py-2">
                    <span className="text-sm text-slate-700 font-mono">{r.table}</span>
                    <span className="text-xs text-slate-500 flex-shrink-0">
                      {r.rows} {r.rows === 1 ? 'row' : 'rows'} ·{' '}
                      <span className={r.action === 'deleted' ? 'text-red-600' : 'text-slate-600'}>
                        {r.action}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {kept.length > 0 && (
              <p className="text-xs text-slate-500 mb-4">
                Rows marked “kept, unlinked” survive without a client attached. Expenses work that
                way on purpose — the money really was spent, so it stays in the split.
              </p>
            )}

            {canDelete(preview) && (
              <>
                <label className="block text-sm text-slate-700 mb-1">
                  Type <span className="font-semibold">{preview.name}</span> to confirm
                </label>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoFocus
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-4"
                  placeholder={preview.name}
                />
              </>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="lg" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              {canDelete(preview) && (
                <Button
                  variant="danger"
                  size="lg"
                  onClick={run}
                  disabled={busy || !readyToDelete(preview, typed)}
                >
                  {busy ? 'Deleting…' : 'Delete forever'}
                </Button>
              )}
            </div>

            {canDelete(preview) && typed.length > 0 && !nameMatches(typed, preview.name) && (
              <p className="text-xs text-slate-500 mt-2 text-right">
                That does not match “{preview.name}”.
              </p>
            )}
          </>
        )}
      </Modal>
    </>
  )
}
