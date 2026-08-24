import { useEffect, useRef, useState } from 'react'
import {
  ACCEPTED,
  MAX_BYTES,
  deleteSopFile,
  fetchSopFiles,
  formatSize,
  isPdf,
  publicUrl,
  uploadSopFile,
} from '../lib/sopFiles'

function icon(file) {
  if (isPdf(file)) return '📄'
  if (/^image\//.test(file.file_type)) return '🖼️'
  if (/sheet|excel/.test(file.file_type)) return '📊'
  if (/presentation/.test(file.file_type)) return '📽️'
  return '📎'
}

// Attachments for one procedure. A PDF opens inline rather than only
// downloading: an SOP is something you read alongside the steps, and making it
// a download means it gets opened once and forgotten.
export default function SopAttachments({ sopId }) {
  const [files, setFiles] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  // Deliberately does not clear the error. It runs straight after an upload or
  // a delete, and clearing here wiped the very message that just explained why
  // the file was rejected. Errors are cleared when the next action starts.
  const load = () =>
    fetchSopFiles(sopId)
      .then((rows) => setFiles(rows))
      .catch((err) => {
        setFiles([])
        setError(
          /sop_files/.test(err.message)
            ? 'Run supabase/sop-files.sql in the Supabase SQL Editor to enable attachments.'
            : err.message
        )
      })

  useEffect(() => {
    setOpenId(null)
    setError('')
    load()
  }, [sopId])

  const add = async (list) => {
    const chosen = [...(list || [])]
    if (chosen.length === 0) return
    setBusy(true)
    setError('')
    // One at a time, and a failure names the file rather than failing silently
    // halfway through a multi-file drop.
    for (const file of chosen) {
      try {
        await uploadSopFile(sopId, file)
      } catch (err) {
        setError(err.message)
        break
      }
    }
    await load()
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const remove = async (file) => {
    if (!confirm(`Delete ${file.file_name}? This cannot be undone.`)) return
    setBusy(true)
    setError('')
    try {
      await deleteSopFile(file)
      if (openId === file.id) setOpenId(null)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (files === null) return null

  return (
    <div className="mt-8 pt-6 border-t border-slate-200">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-bold text-slate-900">
          Attachments
          {files.length > 0 && <span className="ml-1.5 font-normal text-slate-500">{files.length}</span>}
        </h2>
        <label
          className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
            busy ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white hover:bg-slate-800'
          }`}
        >
          {busy ? 'Uploading...' : '+ Add PDF'}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED.join(',')}
            disabled={busy}
            className="hidden"
            onChange={(e) => add(e.target.files)}
          />
        </label>
      </div>

      {error && (
        <div className="p-3 mb-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          add(e.dataTransfer.files)
        }}
        className={`rounded-lg border-2 border-dashed transition ${
          dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200'
        }`}
      >
        {files.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            Drop a PDF here, or use Add PDF. Up to {formatSize(MAX_BYTES)} each.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {files.map((file) => (
              <div key={file.id}>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="text-lg flex-shrink-0">{icon(file)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{file.file_name}</p>
                    <p className="text-[11px] text-slate-500">
                      {formatSize(file.file_size)} ·{' '}
                      {new Date(file.uploaded_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isPdf(file) && (
                      <button
                        onClick={() => setOpenId(openId === file.id ? null : file.id)}
                        className="text-[11px] font-medium text-blue-600 hover:text-blue-800"
                      >
                        {openId === file.id ? 'Hide' : 'Preview'}
                      </button>
                    )}
                    <a
                      href={publicUrl(file.storage_path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-medium text-blue-600 hover:text-blue-800"
                    >
                      Open
                    </a>
                    <button
                      onClick={() => remove(file)}
                      disabled={busy}
                      className="text-[11px] text-slate-400 hover:text-red-600 transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {openId === file.id && (
                  <div className="px-3 pb-3">
                    {/* An <object> falls back to its children when the browser
                        has no PDF viewer, which an <iframe> does not do. */}
                    <object
                      data={publicUrl(file.storage_path)}
                      type="application/pdf"
                      className="w-full rounded border border-slate-200 bg-slate-50"
                      style={{ height: '70vh' }}
                    >
                      <p className="p-4 text-sm text-slate-600">
                        This browser cannot show PDFs inline.{' '}
                        <a
                          href={publicUrl(file.storage_path)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline"
                        >
                          Open it in a new tab
                        </a>
                        .
                      </p>
                    </object>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
