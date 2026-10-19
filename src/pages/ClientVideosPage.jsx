import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import PortalTabs from '../components/PortalTabs'
import PortalSidebar from '../components/PortalSidebar'
import { Panel } from '../components/reports/kit'
import { detailLine, downloadName, driveFileUrl, idsNeedingMeta, mergeClientVideos, summaryLine, wayToGet } from '../lib/clientVideos'
import { downloadUrl, loadClientVideos, metaVideoLinks, publicUrl } from '../lib/clientVideoStore'

/**
 * A client's videos, from the private token in their link: every video ad
 * that went live on their account, to watch here and to download and post
 * on their own pages. The "Your videos" tab of the client's one link, on
 * the same dark surface as their numbers. No login and no agency chrome;
 * nothing here can change anything. The list comes through
 * client_videos_load; the clips we hold play and download from the bucket,
 * the rest play from Meta's own copy, fetched when the page opens.
 */

const AGENCY = 'The Working Class Marketing'

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11M7 10l5 5 5-5M4 19h16" />
    </svg>
  )
}

/** The one button under a video: our file as a download, else Meta's copy or their Drive, else a word. */
function GetIt({ v, metaReady }) {
  const way = wayToGet(v)
  const big = 'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-bold transition'
  if (way === 'download') {
    const name = downloadName(v)
    return (
      <a href={downloadUrl(v.path, name)} download={name} className={`${big} bg-orange-500 text-white shadow-lg shadow-orange-900/30 hover:bg-orange-400`} data-video-download>
        <DownloadIcon />
        Download
      </a>
    )
  }
  if (way === 'meta') {
    return (
      <a href={v.metaUrl} target="_blank" rel="noreferrer" className={`${big} border border-white/20 bg-white/[0.04] text-white hover:bg-white/10`} data-video-open>
        <DownloadIcon />
        Open the file
      </a>
    )
  }
  if (way === 'drive') {
    return (
      <a href={driveFileUrl(v.driveId)} target="_blank" rel="noreferrer" className={`${big} border border-white/20 bg-white/[0.04] text-white hover:bg-white/10`} data-video-drive>
        Open in your Google Drive
      </a>
    )
  }
  return (
    <p className="min-h-[44px] text-[13px] leading-snug text-slate-500" data-video-none>
      {metaReady ? 'This one is older than Meta keeps. Reply to your Monday email and we will send the file.' : 'Finding the file…'}
    </p>
  )
}

function VideoCard({ v, metaReady }) {
  const src = v.path ? publicUrl(v.path) : v.metaUrl || ''
  return (
    <Panel as="article" className="overflow-hidden" data-video-card={v.adId}>
      {/* The whole clip, whatever its shape: a vertical Reel and a square
          feed clip both sit inside the frame rather than being cropped. */}
      <div className="relative aspect-[4/5] bg-black">
        {src ? (
          <video src={src} poster={v.poster || undefined} controls preload={v.poster ? 'none' : 'metadata'} playsInline className="h-full w-full object-contain" aria-label={v.name} />
        ) : v.poster ? (
          <img src={v.poster} alt="" loading="lazy" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-slate-500">{metaReady ? 'Preview not available' : ''}</div>
        )}
      </div>
      <div className="p-3">
        <p className="break-words text-sm font-semibold leading-snug text-white" data-video-name>
          {v.name}
        </p>
        <p className="mt-0.5 text-[12px] text-slate-500" data-video-detail>
          {detailLine(v)}
        </p>
        <div className="mt-3">
          <GetIt v={v} metaReady={metaReady} />
        </div>
      </div>
    </Panel>
  )
}

export default function ClientVideosPage() {
  const { token } = useParams()
  const [data, setData] = useState(undefined)
  const [error, setError] = useState('')
  const [meta, setMeta] = useState(new Map())
  const [metaReady, setMetaReady] = useState(false)

  useEffect(() => {
    let alive = true
    loadClientVideos(token)
      .then((row) => {
        if (alive) setData(row || null)
      })
      .catch((err) => {
        if (!alive) return
        setError(err.message)
        setData(null)
      })
    return () => {
      alive = false
    }
  }, [token])

  // Meta's copy of the clips we do not hold, fetched after the list so the
  // page is up at once. Its links are signed and expire, so they are never
  // stored.
  useEffect(() => {
    if (!data) return
    const ids = idsNeedingMeta(mergeClientVideos(data.videos))
    if (!ids.length) {
      setMetaReady(true)
      return
    }
    let alive = true
    setMetaReady(false)
    metaVideoLinks(token, ids).then((m) => {
      if (!alive) return
      setMeta(m)
      setMetaReady(true)
    })
    return () => {
      alive = false
    }
  }, [data, token])

  // Dark to the edges on a phone, and the tab named for the client.
  useEffect(() => {
    const was = document.body.style.background
    const title = document.title
    document.body.style.background = '#070b14'
    document.title = data?.client?.name ? `Your videos for ${data.client.name}` : 'Your videos'
    return () => {
      document.body.style.background = was
      document.title = title
    }
  }, [data])

  const list = useMemo(() => mergeClientVideos(data?.videos, meta), [data, meta])

  if (data === undefined) return <div className="min-h-screen bg-[#070b14] p-6 text-sm text-slate-400">Opening your videos…</div>
  if (data === null)
    return (
      <div className="min-h-screen bg-[#070b14] p-6">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[#0f1626] p-6 text-sm text-slate-300">
          This link is not valid or has been replaced. Reply to your weekly email and we will send a fresh one.
          {error && <p className="mt-2 text-xs text-slate-500">{error}</p>}
        </div>
      </div>
    )

  const name = data.client?.name || 'your company'

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-200 lg:pl-64" data-client-videos>
      {/* One link, several tabs: this is the videos tab. */}
      <PortalSidebar token={token} active="videos" name={name} />
      <div className="mx-auto max-w-6xl px-4 pb-6 pt-2 md:px-8 md:pb-8 md:pt-3 lg:pt-6">
        <PortalTabs token={token} active="videos" dark />
        <header className="mt-5">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#f8f7f5]">
              <img src="/brand/wc-mark.jpg" alt="The Working Class" className="h-10 w-10 object-contain" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-200">{AGENCY}</span>
          </div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-orange-400">Your videos</p>
          <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-white sm:text-3xl">{name}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400" data-videos-summary>
            {summaryLine(list)} Post them on your own Facebook, Instagram, Google profile or website: they are yours.
          </p>
        </header>

        <section className="mt-6" data-videos>
          {list.length === 0 ? (
            <Panel className="p-6 text-sm leading-relaxed text-slate-400" data-videos-empty>
              When we publish a video ad for you it shows up here the same day, to watch and to download. Want one sooner? Film a script from the Video scripts tab and send it over.
            </Panel>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {list.map((v) => (
                <VideoCard key={v.adId} v={v} metaReady={metaReady} />
              ))}
            </div>
          )}
        </section>

        {list.length > 0 && (
          <Panel className="mt-6 p-5 text-sm leading-relaxed text-slate-400" data-videos-help>
            <p className="font-semibold text-slate-200">Getting a video onto your phone</p>
            <p className="mt-1">Download puts the file in your Files app on an iPhone or your Downloads on Android, ready to post. Open the file shows Meta&apos;s copy in a new tab: press and hold the video, or use the player&apos;s menu, to save it.</p>
          </Panel>
        )}

        <footer className="mt-6 px-1 pb-6 text-xs leading-relaxed text-slate-500">
          Every video ad that has gone live on your ad account, newest first. Questions? Reply to your Monday email and a real person answers.
          <div className="mt-1 text-slate-600">{AGENCY}</div>
        </footer>
      </div>
    </div>
  )
}
