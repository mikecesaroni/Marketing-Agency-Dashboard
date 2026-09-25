import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import DriveFolderFiles from '../components/DriveFolderFiles'
import VideoDropBoard from '../components/VideoDropBoard'
import { Card, Input } from '../components/ui'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/pagedQuery'
import { saveDriveFolder } from '../lib/driveAssets'
import { ago, folderUrl, hubStats, rollupClients, searchClients, sortForContent } from '../lib/contentHub'
import { DROPS_RESET_KEY, dropStats, syncedAdRows, videoDrops } from '../lib/videoLaunch'

/**
 * Content: the creative side of the CRM behind three doors.
 *
 *   Ad Studio     design static ads for a client
 *   Google Drive  every client's folders: open in Drive, browse, download,
 *                 link a folder that is missing
 *   Publish       take saved ads and videos live on Meta
 *
 * The Studio and Publish already exist on each client's page. What did not
 * exist was a way in that starts from the JOB rather than the client: "I am
 * publishing this afternoon, who has creative ready?" Each door opens the
 * same client list, ordered by recent creative activity, and lands on the
 * client page with the right tool already open (?open=studio | publish).
 */

const DOORS = [
  {
    key: 'studio',
    title: 'Ad Studio',
    blurb: 'Design static ads from a client’s photos, logo and offer. Every size at once.',
    cta: 'Pick a client to design for',
    tone: 'from-orange-500 to-amber-400',
    ring: 'group-hover:ring-orange-300',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
        <path d="M12 3l1.8 4.6L18.5 9.4l-4.7 1.8L12 15.8l-1.8-4.6L5.5 9.4l4.7-1.8L12 3Z" />
        <path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8L19 15Z" />
        <path d="M5 16l.6 1.4 1.4.6-1.4.6L5 20l-.6-1.4L3 18l1.4-.6L5 16Z" />
      </svg>
    ),
    stat: (s) => [`${s.saved} saved ads`, `${s.clients} clients`],
  },
  {
    key: 'drive',
    title: 'Google Drive',
    blurb: 'Every client’s folders in one place. Open in Drive, browse the photos, download, link a folder.',
    cta: 'See every client’s folders',
    tone: 'from-blue-600 to-cyan-400',
    ring: 'group-hover:ring-blue-300',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
        <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h4l2 2.5h7A2.5 2.5 0 0 1 21 11v6.5A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-9Z" />
        <path d="M12 11.5v5M9.8 14.3 12 16.5l2.2-2.2" />
      </svg>
    ),
    stat: (s) => [`${s.folders} folders`, `${s.withDrive} of ${s.clients} clients linked`],
  },
  {
    key: 'publish',
    title: 'Publish',
    blurb: 'A fresh video ad per client per week. Drop the clip, pick the words, send it into the funnel.',
    cta: 'See who is 10+ days without a new ad',
    tone: 'from-emerald-600 to-teal-400',
    ring: 'group-hover:ring-emerald-300',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
        <path d="M4.5 12 20 4.5 16.5 20l-5-6.5L4.5 12Z" />
        <path d="M11.5 13.5 20 4.5" />
      </svg>
    ),
    stat: (s) => [
      s.drops ? `${s.drops.due} at 10+ days without a new ad` : `${s.readyToPublish} clients with creative ready`,
      s.drops ? `${s.drops.done} fresh · ${s.live} ads live` : `${s.live} ads live`,
    ],
  },
]

function Door({ door, stats, onOpen }) {
  const [a, b] = stats ? door.stat(stats) : ['', '']
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative flex min-h-[15rem] flex-col overflow-hidden rounded-3xl bg-gradient-to-br ${door.tone} p-6 text-left text-white shadow-lg ring-4 ring-transparent transition hover:-translate-y-0.5 hover:shadow-xl ${door.ring}`}
    >
      <div className="flex items-start justify-between">
        <span className="rounded-2xl bg-white/20 p-3 backdrop-blur">{door.icon}</span>
        <span className="text-2xl opacity-70 transition group-hover:translate-x-1 group-hover:opacity-100">→</span>
      </div>
      <h2 className="mt-5 text-2xl font-bold tracking-tight">{door.title}</h2>
      <p className="mt-1.5 max-w-xs text-sm text-white/85">{door.blurb}</p>
      <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-5">
        <span className="text-xs font-medium text-white/80">{door.cta}</span>
        {stats && (
          <span className="text-right text-xs text-white/90">
            <span className="block font-semibold">{a}</span>
            <span className="block text-white/70">{b}</span>
          </span>
        )}
      </div>
    </button>
  )
}

function Pill({ children, tone = 'slate' }) {
  const cls = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-green-100 text-green-800',
    blue: 'bg-blue-50 text-blue-800',
    amber: 'bg-amber-100 text-amber-800',
  }[tone]
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>
}

/** One client, as a card that opens the right tool on the client page. */
function ClientCard({ row, href, lines, primary }) {
  return (
    <Link
      to={href}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-px hover:border-slate-300 hover:shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{row.name}</p>
          <p className="truncate text-xs text-slate-500">
            {row.industry || 'Client'}
            {row.internal ? ' · internal' : ''}
          </p>
        </div>
        <span className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600">→</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">{lines}</div>
      <p className="mt-3 text-xs font-medium text-blue-700 opacity-0 transition group-hover:opacity-100">{primary}</p>
    </Link>
  )
}

/** Google Drive: folders, browse, download, and link one that is missing. */
function DriveCard({ row, onLinked }) {
  const [open, setOpen] = useState(false)
  const [linking, setLinking] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const link = async () => {
    if (!draft.trim()) return
    setBusy(true)
    setError('')
    try {
      await saveDriveFolder(row.id, draft, { additional: row.folders.length > 0 })
      setDraft('')
      setLinking(false)
      onLinked()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">
            <Link to={`/client/${row.id}`} className="hover:underline">
              {row.name}
            </Link>
          </p>
          <p className="truncate text-xs text-slate-500">
            {row.industry || 'Client'}
            {row.internal ? ' · internal' : ''}
          </p>
        </div>
        {row.folders.length === 0 ? (
          <Pill tone="amber">No folder linked</Pill>
        ) : (
          <>
            {row.folders.map((f, i) => (
              <a
                key={f}
                href={folderUrl(f)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100"
              >
                {row.folders.length > 1 ? `Folder ${i + 1}` : 'Open in Drive'} ↗
              </a>
            ))}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${open ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              {open ? 'Hide files' : 'Browse files'}
            </button>
          </>
        )}
        <button type="button" onClick={() => setLinking((v) => !v)} className="text-xs text-slate-500 hover:text-slate-900 hover:underline">
          {row.folders.length ? '+ folder' : 'Link a folder'}
        </button>
      </div>

      {linking && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[16rem] flex-1">
              <Input
                size="sm"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && link()}
                placeholder="Paste the Drive folder link or ID"
              />
            </div>
            <button type="button" onClick={link} disabled={busy || !draft.trim()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
              {busy ? 'Linking…' : 'Link'}
            </button>
            <button type="button" onClick={() => setLinking(false)} className="text-xs text-slate-500 hover:underline">
              Cancel
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            The folder has to be shared with the CRM&apos;s service account first; the client page says which address. Shared drives need a Manager to add it.
          </p>
          {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
        </div>
      )}

      {open && row.folders.length > 0 && (
        <div className="border-t border-slate-100 px-4 pb-4">
          {/* The same read-only browser the client page shows: live from
              Drive, click a file to open it there (view, download, share). */}
          <DriveFolderFiles clientId={row.id} driveFolderId={row.folders[0]} />
          {row.folders.length > 1 && (
            <p className="mt-2 text-[11px] text-slate-500">
              Images from every linked folder are shown together. Use the folder buttons above to open a specific one in Drive.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

const SECTION_META = {
  studio: {
    title: 'Ad Studio',
    hint: 'Pick a client. The Studio opens on their page with their photos, logo and offer loaded.',
  },
  drive: {
    title: 'Google Drive',
    hint: 'Every client’s linked folders. Open in Drive to download or upload; browse here to see what is in them.',
  },
  publish: {
    title: 'Publish',
    hint: 'Video or image, then the client. A video gets its own publish page; image ads publish from the Studio.',
  },
}

export default function ContentPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || ''
  // Behind the Publish door: video or image first, then the client. Video
  // is its own page (/publish/:id); image ads publish from the Studio.
  const kind = tab === 'publish' ? params.get('kind') || '' : ''
  const [data, setData] = useState(null)
  const [drops, setDrops] = useState(null)
  // The raw client rows, for the drop zone: it needs the Meta account id,
  // which the rollup rows do not carry.
  const [clientRows, setClientRows] = useState([])
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  const load = async () => {
    try {
      const [clients, saved, published, videos, files, reset, synced] = await Promise.all([
        supabase.from('clients').select('id,name,industry,archived,is_internal,drive_folder_id,extra_drive_folder_ids,meta_ad_account_id').order('name'),
        fetchAllRows(() => supabase.from('saved_ads').select('client_id,created_at').order('created_at').order('id')),
        fetchAllRows(() => supabase.from('published_ads').select('client_id,created_at,status,size_key,video_id,ad_name').order('created_at').order('id')),
        supabase.from('ad_videos').select('client_id,created_at,status,meta_video_id,thumb_url,storage_path,file_name'),
        // Only the clips: the table also holds every photo ever uploaded.
        supabase.from('client_files').select('client_id,storage_path,file_name,date_uploaded,uploaded_by').ilike('file_type', 'video/%'),
        // "Start fresh": clips from before this moment are not new.
        supabase.from('app_settings').select('value').eq('key', DROPS_RESET_KEY).maybeSingle(),
        // The newest ad Meta reports per client, whether or not the CRM made
        // it. An account run from Ads Manager still has ads.
        supabase.from('client_newest_ad').select('client_id,ad_id,ad_name,first_seen,is_video'),
      ])
      if (clients.error) throw clients.error
      if (videos.error) throw videos.error
      setData(sortForContent(rollupClients(clients.data || [], saved, published, videos.data || [])))
      setDrops(videoDrops(clients.data || [], [...published, ...syncedAdRows(synced?.data || [])], videos.data || [], new Date(), files.data || [], reset?.data?.value || ''))
      setClientRows(clients.data || [])
      setError('')
    } catch (err) {
      setError(err.message)
      setData([])
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Clears every "new clip dropped in" flag: anything already in the CRM
  // stops counting, and only clips dropped from now on show.
  const resetDrops = async () => {
    const { error: err } = await supabase
      .from('app_settings')
      .upsert({ key: DROPS_RESET_KEY, value: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (err) {
      setError(err.message)
      return
    }
    await load()
  }

  const stats = useMemo(() => (data ? { ...hubStats(data), drops: drops ? dropStats(drops) : null } : null), [data, drops])
  const rows = useMemo(() => (data ? searchClients(data, q) : []), [data, q])
  const openTab = (key, k = '') => setParams(key ? (k ? { tab: key, kind: k } : { tab: key }) : {})
  const meta = SECTION_META[tab]

  return (
    <Layout
      title={meta ? meta.title : 'Content'}
      subtitle={meta ? meta.hint : 'Design it, find it, ship it. Three doors, every client behind each.'}
      actions={
        meta ? (
          <button type="button" onClick={() => openTab('')} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
            ← All content
          </button>
        ) : null
      }
    >
      {error && (
        <Card tone="danger" padding="sm" className="mb-3 text-sm text-red-800">
          {error}
        </Card>
      )}

      {!meta ? (
        /* THE HUB: three doors, and under them the week's video board,
           because the week's job is the video board. */
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            {DOORS.map((d) => (
              <Door key={d.key} door={d} stats={stats} onOpen={() => openTab(d.key)} />
            ))}
          </div>
          <VideoDropBoard rows={drops} clients={clientRows} onDropped={load} onReset={resetDrops} compact />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Door switcher + search, so moving between the three is one click. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm">
              {DOORS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => openTab(d.key)}
                  className={`rounded-lg px-3.5 py-1.5 font-medium transition ${tab === d.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {d.title}
                </button>
              ))}
            </div>
            <div className="ml-auto w-56">
              <Input size="sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a client" />
            </div>
          </div>

          {tab === 'publish' && !kind && (
            /* VIDEO OR IMAGE. Two big choices, then the client list. */
            <div className="grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => openTab('publish', 'video')}
                className="group relative flex min-h-[11rem] flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-400 p-6 text-left text-white shadow-lg ring-4 ring-transparent transition hover:-translate-y-0.5 hover:shadow-xl group-hover:ring-emerald-300"
              >
                <span className="text-3xl">🎬</span>
                <h3 className="mt-3 text-2xl font-bold tracking-tight">Video</h3>
                <p className="mt-1 max-w-xs text-sm text-white/85">
                  This week&rsquo;s clip. Pick the client and land on their publish page with the video flow and nothing else.
                </p>
                <span className="mt-auto pt-4 text-xs font-medium text-white/80">Pick a client →</span>
              </button>
              <button
                type="button"
                onClick={() => openTab('publish', 'image')}
                className="group relative flex min-h-[11rem] flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800 to-slate-600 p-6 text-left text-white shadow-lg ring-4 ring-transparent transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                <span className="text-3xl">🖼️</span>
                <h3 className="mt-3 text-2xl font-bold tracking-tight">Image ads</h3>
                <p className="mt-1 max-w-xs text-sm text-white/85">
                  Statics saved in the Ad Studio. Opens the client&rsquo;s Studio on the Publish tab.
                </p>
                <span className="mt-auto pt-4 text-xs font-medium text-white/80">Pick a client →</span>
              </button>
            </div>
          )}

          {tab === 'publish' && !kind && !q && <VideoDropBoard rows={drops} clients={clientRows} onDropped={load} onReset={resetDrops} />}

          {tab === 'publish' && kind && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <button type="button" onClick={() => openTab('publish')} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 hover:bg-slate-50">
                ← Video or image
              </button>
              <span className="font-medium text-slate-700">{kind === 'video' ? 'Video ad: pick the client' : 'Image ads: pick the client'}</span>
            </div>
          )}

          {tab === 'publish' && !kind && !q ? null : data === null ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : rows.length === 0 ? (
            <Card padding="lg" className="text-center text-sm text-slate-500">
              No client matches.
            </Card>
          ) : tab === 'drive' ? (
            <div className="space-y-2">
              {rows.map((r) => (
                <DriveCard key={r.id} row={r} onLinked={load} />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((r) => (
                <ClientCard
                  key={r.id}
                  row={r}
                  href={tab === 'studio' ? `/client/${r.id}?open=studio` : kind === 'video' ? `/publish/${r.id}` : `/client/${r.id}?open=publish`}
                  primary={tab === 'studio' ? 'Open the Ad Studio →' : kind === 'video' ? 'Publish a video →' : 'Open Publish →'}
                  lines={
                    tab === 'studio' ? (
                      <>
                        <Pill tone={r.saved ? 'blue' : 'slate'}>{r.saved} saved ad{r.saved === 1 ? '' : 's'}</Pill>
                        <Pill tone={r.folders.length ? 'blue' : 'amber'}>{r.folders.length ? 'Drive linked' : 'No Drive folder'}</Pill>
                        {r.lastActivity && <Pill>last work {ago(r.lastActivity)}</Pill>}
                      </>
                    ) : (
                      <>
                        <Pill tone={r.saved ? 'green' : 'slate'}>{r.saved} ad{r.saved === 1 ? '' : 's'} ready</Pill>
                        <Pill tone={r.videos ? 'green' : 'slate'}>{r.videos} video{r.videos === 1 ? '' : 's'}</Pill>
                        <Pill tone={r.live ? 'blue' : 'slate'}>{r.live} live</Pill>
                        {r.lastPublished && <Pill>published {ago(r.lastPublished)}</Pill>}
                      </>
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
