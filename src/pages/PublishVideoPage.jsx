import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import PublishToMetaPanel from '../components/PublishToMetaPanel'
import { Card } from '../components/ui'
import { supabase } from '../lib/supabaseClient'
import { fetchPublishedAds } from '../lib/metaPublish'
import { ago } from '../lib/contentHub'
import { isVideoAd } from '../lib/videoLaunch'

/**
 * Publish a video: its own page.
 *
 *   Content → Publish → Video → client → here.
 *
 * The publish flow used to live five clicks deep inside the Ad Studio, which
 * is a design tool, inside the client page, which is everything else. A
 * teammate whose whole job this week is "get the clips out" should land on
 * a page that is only that: the client at the top, the clips, the words,
 * where it goes, the button. Nothing else on the screen.
 *
 * /publish/:clientId, with ?video=<storage path> to land with a clip
 * already ticked (the board's "click to publish"). The panel underneath is
 * the same PublishToMetaPanel the Studio uses, in video-only mode, so the
 * two never drift.
 */
export default function PublishVideoPage() {
  const { clientId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [intake, setIntake] = useState(null)
  const [published, setPublished] = useState([])
  const [others, setOthers] = useState([])
  const [error, setError] = useState('')
  // One or several clips to land with ticked (comma separated, each
  // URL-encoded), from the board's "click to publish".
  const initialVideo = (params.get('video') || '').split(',').map((s) => s.trim()).filter(Boolean)
  // The Layout header is sticky; the launch strip inside the panel has to
  // stick just below it, and the header's height depends on the viewport.
  const [headerHeight, setHeaderHeight] = useState(0)
  useEffect(() => {
    const measure = () => setHeaderHeight(document.querySelector('header')?.offsetHeight || 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [client])

  useEffect(() => {
    let cancelled = false
    setClient(null)
    setError('')
    ;(async () => {
      try {
        const [c, i, p, all] = await Promise.all([
          supabase.from('clients').select('*').eq('id', clientId).single(),
          supabase.from('onboarding_intake').select('*').eq('client_id', clientId).maybeSingle(),
          fetchPublishedAds(clientId).catch(() => []),
          supabase.from('clients').select('id,name,meta_ad_account_id,archived').order('name'),
        ])
        if (c.error) throw c.error
        if (cancelled) return
        setClient(c.data)
        setIntake(i?.data || null)
        setPublished(p || [])
        setOthers((all.data || []).filter((x) => !x.archived))
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clientId])

  const lastVideo = published.filter(isVideoAd).map((r) => r.created_at).sort().pop() || null
  const videoCount = published.filter(isVideoAd).length

  return (
    <Layout
      title="Publish a video"
      subtitle={client ? `${client.name}: drop the clip, pick the words, send it into the funnel.` : 'Loading…'}
      actions={
        <>
          <Link to="/content?tab=publish" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
            ← Publish
          </Link>
          {client && (
            <Link to={`/client/${client.id}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
              Client page
            </Link>
          )}
        </>
      }
    >
      {error && (
        <Card tone="danger" padding="sm" className="mb-3 text-sm text-red-800">
          {error}
        </Card>
      )}

      {client && (
        <div className="mx-auto max-w-5xl space-y-4">
          {/* THE CLIENT, big, with the numbers that matter this week and a
              way to jump to the next one without going back out. */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-500 p-5 text-white shadow-lg md:p-6">
            <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100">Video ad for</p>
                <h2 className="mt-1 truncate text-2xl font-bold tracking-tight md:text-3xl">{client.name}</h2>
                <p className="mt-1 text-sm text-emerald-50/90">
                  {client.industry || 'Client'}
                  {' · '}
                  {lastVideo ? `last video ad ${ago(lastVideo)}` : 'no video ad yet'}
                  {videoCount > 0 ? ` · ${videoCount} so far` : ''}
                  {!client.meta_ad_account_id && ' · no Meta ad account connected'}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-emerald-50">
                Switch client
                <select
                  value={client.id}
                  onChange={(e) => navigate(`/publish/${e.target.value}`)}
                  className="rounded-lg border border-white/30 bg-white/15 px-2.5 py-1.5 text-sm text-white backdrop-blur [&>option]:text-slate-900"
                >
                  {others.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.meta_ad_account_id ? '' : ' (no Meta)'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <Card padding="lg">
            <PublishToMetaPanel
              key={`${client.id}:${initialVideo.join('|')}`}
              client={client}
              intake={intake}
              initialVideo={initialVideo}
              videoOnly
              stickyTop={headerHeight}
              alreadyPublished={published}
              onPublished={() =>
                fetchPublishedAds(client.id)
                  .then(setPublished)
                  .catch(() => {})
              }
            />
          </Card>
        </div>
      )}
    </Layout>
  )
}
