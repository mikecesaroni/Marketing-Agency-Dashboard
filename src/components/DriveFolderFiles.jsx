import { useEffect, useState } from 'react'
import { listDriveImages } from '../lib/driveAssets'
import DriveThumbImage from './DriveThumb'

// The client's Drive folder, shown beside the files they uploaded here.
//
// These are not CRM files and are not copied into the CRM, so they get their
// own block rather than being mixed into the uploaded list: nothing here can be
// renamed, deleted or included in "Download All", and a row that looks like the
// others but silently ignores those buttons would be worse than a separate one.
//
// Read-only by design. The token is scoped to drive.readonly, so the honest UI
// is a view with a way out to Drive, where they can actually change things.

const folderUrl = (id) => `https://drive.google.com/drive/folders/${id}`
const fileUrl = (id) => `https://drive.google.com/file/d/${id}/view`

export default function DriveFolderFiles({ clientId, driveFolderId }) {
  const [files, setFiles] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!driveFolderId) return
    setLoading(true)
    setError('')
    try {
      setFiles(await listDriveImages(clientId))
    } catch (err) {
      setError(err.message)
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setFiles(null)
    if (driveFolderId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, driveFolderId])

  // Nothing linked yet. Worth saying where it gets linked rather than staying
  // silent, because the answer is not on this screen.
  if (!driveFolderId) {
    return (
      <div className="mt-6 pt-4 border-t border-slate-200">
        <h3 className="font-bold text-slate-900 text-sm">Google Drive</h3>
        <p className="text-xs text-slate-500 mt-1">
          No folder linked. The client can connect one from their onboarding link, or you can
          paste it in the Ad Studio under either image picker&apos;s Drive tab.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-6 pt-4 border-t border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 className="font-bold text-slate-900 text-sm">
          Google Drive
          {files && <span className="text-xs font-normal text-slate-500"> ({files.length})</span>}
        </h3>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="text-xs text-blue-600 hover:underline disabled:opacity-50"
          >
            {loading ? 'Reading...' : 'Refresh'}
          </button>
          <a
            href={folderUrl(driveFolderId)}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            Open in Drive ↗
          </a>
        </div>
      </div>

      <p className="text-xs text-slate-500 mb-3">
        Live from the client&apos;s folder — not stored here. Anything they add shows up on
        refresh, and it is all usable in the Ad Studio.
      </p>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {files && files.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
          {files.map((f) => (
            <a
              key={f.id}
              href={fileUrl(f.id)}
              target="_blank"
              rel="noreferrer"
              title={f.name}
              className="relative aspect-square rounded border border-slate-200 overflow-hidden hover:border-slate-400 transition block"
            >
              <DriveThumbImage clientId={clientId} file={f} />
              {f.converted && (
                // Drive converts these on the way through; without the tag a
                // HEIC that works here but not on a Mac preview looks odd.
                <span className="absolute bottom-0 left-0 right-0 bg-black/55 text-white text-[9px] leading-4 text-center">
                  HEIC
                </span>
              )}
            </a>
          ))}
        </div>
      )}

      {files && files.length === 0 && !error && !loading && (
        <p className="text-xs text-slate-500">
          The folder is connected but has no images in it yet. Subfolders are not searched.
        </p>
      )}
    </div>
  )
}
