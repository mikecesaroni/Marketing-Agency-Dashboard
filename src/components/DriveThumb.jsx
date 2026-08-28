import { useEffect, useState } from 'react'
import { driveObjectUrl } from '../lib/driveAssets'

/**
 * One Drive thumbnail, or a placeholder while it loads.
 *
 * Shared by the Ad Studio picker and the client files list. They wrap it in
 * different things — a button that selects in one case, a link out to Drive in
 * the other — but the image inside is identical, so it lives here once.
 *
 * The underlying fetch is cached per file, so two components showing the same
 * folder cost one request each rather than one per mount.
 */
function useDriveThumb(clientId, fileId) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setUrl('')
    setFailed(false)
    driveObjectUrl(clientId, fileId, { thumb: true })
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [clientId, fileId])

  return { url, failed }
}

export default function DriveThumbImage({ clientId, file, className = '' }) {
  const { url, failed } = useDriveThumb(clientId, file.id)

  if (!url) {
    return (
      <span
        className={`absolute inset-0 flex items-center justify-center text-[10px] text-slate-400 px-1 text-center ${className}`}
      >
        {failed ? 'no preview' : '...'}
      </span>
    )
  }
  return <img src={url} alt={file.name} className={`w-full h-full object-cover ${className}`} />
}
