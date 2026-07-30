import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function ClientFilesSection({ clientId, clientName }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

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

  const handleFileUpload = async (e) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setUploading(true)
    setError('')

    try {
      const fileExt = selectedFile.name.split('.').pop()
      const fileName = `${clientId}/${Date.now()}.${fileExt}`

      const { error: uploadErr } = await supabase.storage
        .from('client-files')
        .upload(fileName, selectedFile)

      if (uploadErr) throw uploadErr

      const { error: dbErr } = await supabase.from('client_files').insert({
        client_id: clientId,
        file_name: selectedFile.name,
        file_type: selectedFile.type || 'file',
        file_size: selectedFile.size,
        storage_path: fileName,
      })

      if (dbErr) throw dbErr

      await loadFiles()
      e.target.value = ''
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
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
      <h2 className="text-xl font-bold text-slate-900 mb-4">Client Files</h2>

      <div className="mb-6">
        <label className="flex items-center justify-center w-full p-4 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-slate-400 transition">
          <div className="text-center">
            <div className="text-slate-600 mb-2">📁 Upload Logo or Files</div>
            <input
              type="file"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
              accept="image/*,.pdf,.doc,.docx"
            />
            <span className="text-xs text-slate-500">
              {uploading ? 'Uploading...' : 'Click to upload or drag and drop'}
            </span>
          </div>
        </label>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
          {error}
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
              <button
                onClick={() => handleDeleteFile(file.id, file.storage_path)}
                className="ml-2 px-3 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
