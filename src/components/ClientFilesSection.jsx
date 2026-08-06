import { useState, useEffect } from 'react'
import JSZip from 'jszip'
import { supabase } from '../lib/supabaseClient'
import Modal from './Modal'

export default function ClientFilesSection({ clientId, clientName }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [renaming, setRenaming] = useState(null)
  const [newName, setNewName] = useState('')
  const [zipping, setZipping] = useState('')
  const [downloadingId, setDownloadingId] = useState(null)

  useEffect(() => {
    loadFiles()
  }, [clientId])

  const loadFiles = async () => {
    try {
      const { data, error: err } = await supabase
        .from('client_files')
        .select('*')
        .eq('client_id', clientId)
        .order('date_uploaded', { ascending: false })

      if (err) throw err
      setFiles(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const uploadFiles = async (fileList) => {
    const selected = Array.from(fileList || [])
    if (selected.length === 0) return

    setUploading(true)
    setError('')

    try {
      for (const file of selected) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${clientId}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${fileExt}`

        const { error: uploadErr } = await supabase.storage
          .from('client-files')
          .upload(fileName, file)

        if (uploadErr) throw uploadErr

        const { error: dbErr } = await supabase.from('client_files').insert({
          client_id: clientId,
          file_name: file.name,
          file_type: file.type || 'file',
          file_size: file.size,
          storage_path: fileName,
        })

        if (dbErr) throw dbErr
      }

      await loadFiles()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleFileUpload = async (e) => {
    await uploadFiles(e.target.files)
    e.target.value = ''
  }

  // Without preventDefault on dragOver the browser refuses the drop and just
  // navigates to the file instead.
  const handleDragOver = (e) => {
    e.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setDragging(false)
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    setDragging(false)
    await uploadFiles(e.dataTransfer.files)
  }

  const handleDeleteFile = async (fileId, storagePath) => {
    if (!confirm('Delete this file?')) return

    try {
      await supabase.storage.from('client-files').remove([storagePath])

      const { error: dbErr } = await supabase
        .from('client_files')
        .delete()
        .eq('id', fileId)

      if (dbErr) throw dbErr

      await loadFiles()
    } catch (err) {
      setError(err.message)
    }
  }

  // Only the display name changes — the stored object keeps its original path,
  // so existing links stay valid and there's nothing to move in the bucket.
  const handleRename = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return

    // Keep the extension if they typed a name without one, so the file still
    // opens in the right app when downloaded.
    const oldExt = renaming.file_name.includes('.')
      ? renaming.file_name.split('.').pop()
      : ''
    const finalName =
      oldExt && !trimmed.toLowerCase().endsWith(`.${oldExt.toLowerCase()}`)
        ? `${trimmed}.${oldExt}`
        : trimmed

    const { error: err } = await supabase
      .from('client_files')
      .update({ file_name: finalName })
      .eq('id', renaming.id)

    if (err) return setError(err.message)
    setRenaming(null)
    await loadFiles()
  }

  // Fetched into a blob rather than pointed at with a download attribute: the
  // storage URL is a different origin, where browsers ignore that attribute and
  // just navigate. Going through a blob also means the file saves under its
  // display name instead of the generated storage path.
  const handleDownloadOne = async (file) => {
    setError('')
    setDownloadingId(file.id)

    try {
      const res = await fetch(getPublicUrl(file.storage_path))
      if (!res.ok) throw new Error(`Could not download this file (HTTP ${res.status})`)

      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = file.file_name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setDownloadingId(null)
    }
  }

  // Zipped in the browser rather than firing one download per file: phones and
  // Safari block or mangle rapid multi-file downloads, and a single archive is
  // what you actually want to hand over anyway.
  const handleDownloadAll = async () => {
    setError('')
    setZipping('Preparing...')

    try {
      const zip = new JSZip()
      const used = new Set()
      const failed = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setZipping(`Downloading ${i + 1} of ${files.length}...`)

        try {
          const res = await fetch(getPublicUrl(file.storage_path))
          if (!res.ok) throw new Error(`HTTP ${res.status}`)

          // Two files can share a display name after renaming, and a zip with
          // duplicate entries silently loses all but one.
          let name = file.file_name
          if (used.has(name)) {
            const dot = name.lastIndexOf('.')
            const stem = dot > 0 ? name.slice(0, dot) : name
            const ext = dot > 0 ? name.slice(dot) : ''
            let n = 2
            while (used.has(`${stem} (${n})${ext}`)) n++
            name = `${stem} (${n})${ext}`
          }
          used.add(name)

          zip.file(name, await res.blob())
        } catch {
          failed.push(file.file_name)
        }
      }

      if (used.size === 0) {
        setError('None of the files could be downloaded.')
        return
      }

      setZipping('Building zip...')
      const blob = await zip.generateAsync({ type: 'blob' })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(clientName || 'client').replace(/[^\w\s-]/g, '')} files.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      if (failed.length > 0) {
        setError(`Skipped ${failed.length} file(s) that failed to download: ${failed.join(', ')}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setZipping('')
    }
  }

  const getPublicUrl = (storagePath) => {
    const { data } = supabase.storage
      .from('client-files')
      .getPublicUrl(storagePath)
    return data.publicUrl
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  if (loading) {
    return <div className="text-slate-500">Loading files...</div>
  }

  return (
    <div className="bg-white rounded-lg md:rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-4">
        <h2 className="text-xl font-bold text-slate-900">
          Client Files
          {files.length > 0 && (
            <span className="text-sm font-normal text-slate-500"> ({files.length})</span>
          )}
        </h2>
        {files.length > 0 && (
          <button
            onClick={handleDownloadAll}
            disabled={!!zipping}
            className="w-full md:w-auto px-3 py-2 md:py-1.5 text-sm bg-slate-200 text-slate-800 rounded-lg font-medium hover:bg-slate-300 disabled:opacity-60 transition"
          >
            {zipping || `Download All (${files.length})`}
          </button>
        )}
      </div>

      <div className="mb-6">
        <label
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex items-center justify-center w-full p-6 border-2 border-dashed rounded-lg cursor-pointer transition ${
            dragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-slate-300 hover:border-slate-400'
          }`}
        >
          <div className="text-center pointer-events-none">
            <div className="text-slate-600 mb-2">📁 Upload Logo or Files</div>
            <span className="text-xs text-slate-500">
              {uploading
                ? 'Uploading...'
                : dragging
                  ? 'Drop to upload'
                  : 'Click to upload or drag and drop'}
            </span>
          </div>
          <input
            type="file"
            multiple
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx"
          />
        </label>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
          {/* The raw "Bucket not found" gives no hint that this is a one-time
              setup step rather than a broken upload. */}
          {error.toLowerCase().includes('bucket') ? (
            <>
              <p className="font-semibold mb-1">File storage isn't set up yet.</p>
              <p>
                Run <code className="bg-red-100 px-1 rounded">supabase/storage-bucket.sql</code>{' '}
                in the Supabase SQL Editor to create the storage bucket, then try again.
              </p>
            </>
          ) : (
            error
          )}
        </div>
      )}

      {files.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-8">No files uploaded yet</p>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition"
            >
              <div className="flex-1 min-w-0">
                <a
                  href={getPublicUrl(file.storage_path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 font-medium truncate block"
                >
                  {file.file_name}
                </a>
                <div className="text-xs text-slate-500 mt-1">
                  {formatFileSize(file.file_size)} •{' '}
                  {new Date(file.date_uploaded).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <button
                  onClick={() => handleDownloadOne(file)}
                  disabled={downloadingId === file.id}
                  className="px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition disabled:opacity-60"
                >
                  {downloadingId === file.id ? 'Saving...' : 'Download'}
                </button>
                <button
                  onClick={() => {
                    setNewName(file.file_name)
                    setRenaming(file)
                  }}
                  className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded transition"
                >
                  Rename
                </button>
                <button
                  onClick={() => handleDeleteFile(file.id, file.storage_path)}
                  className="px-3 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={!!renaming} onClose={() => setRenaming(null)} title="Rename File">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleRename()
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">File name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              autoFocus
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              The file extension is kept automatically if you leave it off.
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setRenaming(null)}
              className="flex-1 bg-slate-200 text-slate-900 py-2.5 rounded-lg font-medium hover:bg-slate-300 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
