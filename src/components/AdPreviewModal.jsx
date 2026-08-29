import { useEffect, useState } from 'react'
import Modal from './Modal'
import PlatformSplit, { PlatformTable } from './charts/PlatformSplit'
import { Badge, Button, Card } from './ui'
import { byPlatform, byPosition, fetchAdPreview, fetchPlatformRows } from '../lib/adPlatforms'
import { money } from '../lib/queries'

/**
 * One ad, shown rather than described.
 *
 * Two things nobody could see before: what the ad actually looks like, and
 * where it ran. The first comes from Meta on demand -- it renders the ad the
 * way the feed does, chrome and all -- and the second from the platform rows
 * the nightly sync now writes.
 *
 * The preview is an iframe Meta hands over. That is not a shortcut: an image
 * shows the creative, but only Meta can draw the headline, the button, the
 * profile row and the crop each surface actually applies. The image_url is
 * kept as the fallback for a creative Meta declines to render.
 */

const TABS = [
  { key: 'feed', label: 'Feed' },
  { key: 'story', label: 'Story' },
  { key: 'desktop', label: 'Desktop' },
]

// Meta's own preview canvases. Its iframes carry no useful height of their
// own, so the frame has to be sized here or it collapses to a sliver.
const FRAME = {
  feed: { width: 340, height: 620 },
  story: { width: 340, height: 620 },
  desktop: { width: 560, height: 560 },
}

function srcFrom(iframeHtml) {
  const match = String(iframeHtml || '').match(/src="([^"]+)"/)
  if (!match) return null
  // Meta escapes the ampersands for HTML embedding; as a bare src they have to
  // be real ones again or every parameter after the first is lost.
  return match[1].replace(/&amp;/g, '&')
}

export default function AdPreviewModal({ clientId, ad, onClose }) {
  const [preview, setPreview] = useState(null)
  const [rows, setRows] = useState(null)
  const [tab, setTab] = useState('feed')
  const [showTable, setShowTable] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const adId = ad?.ad_id

  useEffect(() => {
    if (!adId) return
    let cancelled = false
    setLoading(true)
    setError('')
    setPreview(null)
    setRows(null)

    // Side by side rather than in sequence: the preview is a round trip to
    // Meta and the rows are a local query, and waiting for the slow one to
    // start the fast one just makes the panel feel slower than it is.
    Promise.allSettled([fetchAdPreview(clientId, adId), fetchPlatformRows({ clientId, adId })])
      .then(([p, r]) => {
        if (cancelled) return
        if (p.status === 'fulfilled') setPreview(p.value)
        else setError(p.reason?.message || 'Could not load the preview.')
        if (r.status === 'fulfilled') setRows(r.value)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [clientId, adId])

  const available = (preview?.previews || []).map((p) => p.key)
  const shown = available.includes(tab) ? tab : available[0]
  const frame = preview?.previews?.find((p) => p.key === shown)
  const src = srcFrom(frame?.iframe)
  const size = FRAME[shown] || FRAME.feed

  const platforms = rows ? byPlatform(rows, 'spend') : []
  const positions = rows ? byPosition(rows, 'spend', 5) : []
  const spend = rows ? rows.reduce((t, r) => t + (Number(r.spend) || 0), 0) : 0
  const leads = rows ? rows.reduce((t, r) => t + (Number(r.leads) || 0), 0) : 0

  return (
    <Modal isOpen={Boolean(ad)} onClose={onClose} title={ad?.ad_name || ad?.ad_id || 'Ad'}>
      <div className="space-y-5">
        {error && (
          <Card tone="danger" padding="sm" className="text-sm text-red-700">
            {error}
          </Card>
        )}

        {loading ? (
          <p className="text-sm text-slate-500">Loading the ad from Meta…</p>
        ) : (
          <>
            {preview && (
              <div className="space-y-3">
                {(preview.title || preview.body) && (
                  <div>
                    {preview.title && (
                      <p className="text-sm font-semibold tracking-tight text-slate-900">
                        {preview.title}
                      </p>
                    )}
                    {preview.body && (
                      <p className="mt-0.5 text-sm text-slate-600">{preview.body}</p>
                    )}
                  </div>
                )}

                {available.length > 1 && (
                  <div className="flex gap-1.5">
                    {TABS.filter((t) => available.includes(t.key)).map((t) => (
                      <Button
                        key={t.key}
                        size="sm"
                        variant={shown === t.key ? 'dark' : 'outline'}
                        onClick={() => setTab(t.key)}
                      >
                        {t.label}
                      </Button>
                    ))}
                  </div>
                )}

                <div className="flex justify-center rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {src ? (
                    <iframe
                      key={src}
                      src={src}
                      title={`${shown} preview`}
                      width={size.width}
                      height={size.height}
                      className="max-w-full rounded-lg border-0 bg-white"
                      // Meta's preview is a third-party page. It needs to run
                      // its own scripts to draw the ad, and nothing more.
                      sandbox="allow-scripts allow-same-origin allow-popups"
                      loading="lazy"
                    />
                  ) : preview.image_url ? (
                    <img
                      src={preview.image_url}
                      alt={preview.name || 'Ad creative'}
                      className="max-h-[520px] rounded-lg"
                    />
                  ) : (
                    <p className="py-8 text-sm text-slate-400">
                      Meta returned no preview for this creative.
                    </p>
                  )}
                </div>
              </div>
            )}

            {rows && rows.length > 0 ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Where it ran
                  </p>
                  <p className="text-xs text-slate-500">
                    <span className="tabular-nums font-medium text-slate-900">{money(spend)}</span>{' '}
                    spent ·{' '}
                    <span className="tabular-nums font-medium text-slate-900">{leads}</span>{' '}
                    {leads === 1 ? 'lead' : 'leads'}
                  </p>
                </div>

                <PlatformSplit data={platforms} metric="spend" />

                <div className="space-y-1.5">
                  {positions.map((p) => (
                    <div key={p.key} className="flex items-center gap-3">
                      <span className="w-44 flex-shrink-0 truncate text-xs text-slate-600">
                        {p.label}
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className="block h-full rounded-full bg-slate-400"
                          style={{ width: `${Math.max(p.share * 100, 1)}%` }}
                        />
                      </span>
                      <span className="w-20 flex-shrink-0 text-right text-xs tabular-nums text-slate-500">
                        {money(p.value)}
                      </span>
                    </div>
                  ))}
                </div>

                <div>
                  <Button variant="link" size="sm" onClick={() => setShowTable((v) => !v)}>
                    {showTable ? 'Hide the numbers' : 'Show the numbers'}
                  </Button>
                  {showTable && (
                    <div className="mt-2">
                      <PlatformTable data={platforms} />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                No platform breakdown yet for this ad. The nightly sync writes it for the last two
                weeks of delivery.
              </p>
            )}

            {preview?.status && (
              <div className="flex items-center gap-2 border-t border-slate-200 pt-3">
                <Badge tone={preview.status === 'ACTIVE' ? 'success' : 'dim'}>
                  {preview.status}
                </Badge>
                <span className="text-[11px] text-slate-400">Ad {preview.ad_id}</span>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
