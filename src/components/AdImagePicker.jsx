import { useEffect, useState } from 'react'
import { copyText } from '../lib/intakeSummary'
import {
  driveObjectUrl,
  drivePath,
  driveFileId,
  isDrivePath,
  listDriveImages,
  saveDriveFolder,
  driveServiceAccount,
} from '../lib/driveAssets'

// Picks the background photo or the logo for an ad, from either source.
//
// Two sources, one selection. "Uploaded" is the CRM's own bucket, fed by drag
// and drop or the file button. "Drive" reads the client's linked folder live, so
// a photo taken on a job site an hour ago is pickable without anyone uploading
// it. Whichever is used, the value handed back is a single string the rest of
// the Studio already knows how to carry.
//
// Defined at module scope rather than inside AdStudioPanel: a component
// declared during render is a different type on every keystroke, so React
// unmounts and remounts it, which would drop the Drive listing and every
// thumbnail each time a letter was typed into the hook field.

const IMAGE_TYPES = /^image\/(png|jpeg|webp|gif)$/

/** One Drive thumbnail. Loads its own bytes so the grid fills in progressively. */
function DriveThumb({ client, file, selected, onPick }) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    driveObjectUrl(client.id, file.id, { thumb: true })
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [client.id, file.id])

  return (
    <button
      type="button"
      onClick={() => onPick(file)}
      title={file.name}
      className={`relative aspect-square rounded border overflow-hidden transition ${
        selected ? 'border-blue-600 ring-2 ring-blue-200' : 'border-slate-300 hover:border-slate-400'
      }`}
    >
      {url ? (
        <img src={url} alt={file.name} className="w-full h-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-400 px-1 text-center">
          {failed ? 'no preview' : '...'}
        </span>
      )}
      {selected && (
        <span className="absolute top-1 right-1 bg-blue-600 text-white rounded-full w-4 h-4 text-[10px] leading-4 text-center">
          ✓
        </span>
      )}
      {file.converted && (
        // iPhone photos are HEIC, which no browser can decode. Drive converts
        // them on the way through, so these work like any other photo -- the
        // tag is only here so a 5MB .HEIC appearing in an ad is not a surprise.
        <span
          title="Converted from HEIC by Google Drive"
          className="absolute bottom-0 left-0 right-0 bg-black/55 text-white text-[9px] leading-4 text-center"
        >
          HEIC
        </span>
      )}
    </button>
  )
}

export default function AdImagePicker({
  client,
  files,
  value,
  onChange,
  onUpload,
  label,
  driveFolderId,
  onFolderSaved,
}) {
  const [source, setSource] = useState('files')
  const [dragging, setDragging] = useState(false)
  const [driveFiles, setDriveFiles] = useState(null)
  const [driveError, setDriveError] = useState('')
  const [loadingDrive, setLoadingDrive] = useState(false)
  const [folderInput, setFolderInput] = useState('')
  const [serviceEmail, setServiceEmail] = useState('')
  const [savingFolder, setSavingFolder] = useState(false)

  const loadDrive = async () => {
    if (!driveFolderId) return
    setLoadingDrive(true)
    setDriveError('')
    try {
      setDriveFiles(await listDriveImages(client.id))
    } catch (err) {
      setDriveError(err.message)
      setDriveFiles([])
    } finally {
      setLoadingDrive(false)
    }
  }

  // Only when the Drive tab is actually opened. Listing a folder on mount would
  // spend a Drive round trip for every client page view, most of which never
  // touch the Studio.
  useEffect(() => {
    if (source === 'drive' && driveFolderId && driveFiles === null) loadDrive()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, driveFolderId])

  useEffect(() => {
    if (source !== 'drive' || driveFolderId || serviceEmail) return
    driveServiceAccount()
      .then(setServiceEmail)
      // A missing email is not worth an error banner; the docs still say what
      // to do, and the link box below works either way.
      .catch(() => {})
  }, [source, driveFolderId, serviceEmail])

  const linkFolder = async () => {
    setSavingFolder(true)
    setDriveError('')
    try {
      const saved = await saveDriveFolder(client.id, folderInput)
      onFolderSaved?.(saved)
      setFolderInput('')
      setDriveFiles(null)
    } catch (err) {
      setDriveError(err.message)
    } finally {
      setSavingFolder(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = [...(e.dataTransfer?.files || [])].find((f) => IMAGE_TYPES.test(f.type))
    if (file) onUpload(file)
  }

  // What the current pick is called, so the selection is legible without
  // hunting for which thumbnail has a tick on it.
  const selectedName = (() => {
    if (!value) return ''
    if (isDrivePath(value)) {
      const id = driveFileId(value)
      return driveFiles?.find((f) => f.id === id)?.name || 'Drive photo'
    }
    return files.find((f) => f.storage_path === value)?.file_name || value.split('/').pop()
  })()

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`rounded-lg border-2 border-dashed p-2 transition ${
        dragging ? 'border-blue-500 bg-blue-50' : 'border-transparent'
      }`}
    >
      <div className="flex items-center justify-between mb-1 gap-2">
        <label className="block text-xs font-medium text-slate-600">{label}</label>
        <div className="flex gap-1">
          {['files', 'drive'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                source === s ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s === 'files' ? 'Uploaded' : 'Drive'}
            </button>
          ))}
        </div>
      </div>

      {source === 'files' ? (
        <div className="flex gap-2">
          <select
            value={isDrivePath(value) ? '' : value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-xs min-w-0"
          >
            <option value="">None</option>
            {files.map((f) => (
              <option key={f.storage_path} value={f.storage_path}>
                {f.file_name}
              </option>
            ))}
          </select>
          <label className="px-2 py-1.5 bg-slate-100 border border-slate-300 rounded text-xs cursor-pointer hover:bg-slate-200 whitespace-nowrap">
            Upload
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
            />
          </label>
        </div>
      ) : !driveFolderId ? (
        <div className="space-y-1.5">
          <p className="text-[11px] text-slate-500 leading-snug">
            In Drive, share this client&apos;s folder as <strong>Viewer</strong> with{' '}
            {serviceEmail ? (
              <button
                type="button"
                onClick={() => copyText(serviceEmail)}
                title="Copy"
                className="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded hover:bg-slate-200 break-all"
              >
                {serviceEmail}
              </button>
            ) : (
              'the service account'
            )}
            , then paste the folder link here.
          </p>
          <div className="flex gap-2">
            <input
              value={folderInput}
              onChange={(e) => setFolderInput(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-xs min-w-0"
            />
            <button
              type="button"
              onClick={linkFolder}
              disabled={savingFolder || !folderInput.trim()}
              className="px-2 py-1.5 bg-blue-600 text-white rounded text-xs font-medium disabled:opacity-50 whitespace-nowrap"
            >
              {savingFolder ? 'Linking...' : 'Link'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              {loadingDrive
                ? 'Reading the folder...'
                : `${driveFiles?.length ?? 0} photo${driveFiles?.length === 1 ? '' : 's'}`}
            </span>
            <button
              type="button"
              onClick={loadDrive}
              disabled={loadingDrive}
              className="text-[11px] text-blue-600 hover:underline disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {driveFiles && driveFiles.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5 max-h-44 overflow-y-auto">
              {driveFiles.map((f) => (
                <DriveThumb
                  key={f.id}
                  client={client}
                  file={f}
                  selected={value === drivePath(f.id)}
                  onPick={(picked) => onChange(drivePath(picked.id))}
                />
              ))}
            </div>
          )}

          {driveFiles && driveFiles.length === 0 && !driveError && !loadingDrive && (
            <p className="text-[11px] text-slate-500">
              No images in that folder. Note that subfolders are not searched.
            </p>
          )}
        </div>
      )}

      {driveError && <p className="text-[11px] text-red-600 mt-1">{driveError}</p>}

      <p className="text-[11px] text-slate-400 mt-1 truncate">
        {selectedName ? `Using: ${selectedName}` : 'Nothing picked · drag an image here to upload'}
      </p>
    </div>
  )
}
