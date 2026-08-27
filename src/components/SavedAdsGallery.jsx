import { useEffect, useState } from 'react'
import { copyText } from '../lib/intakeSummary'
import { deleteSavedAd, fetchSavedAds } from '../lib/savedAds'

function when(date) {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Everything saved out of the Studio, grouped back into the three-size sets it
// was saved as. The public URL matters more than the picture: that is the
// address Meta fetches the image bytes from.
export default function SavedAdsGallery({ clientId, clientName, onEdit, onPublish }) {
  const [sets, setSets] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [busy, setBusy] = useState('')

  const load = () =>
    fetchSavedAds(clientId)
      .then(setSets)
      .catch((err) => {
        setError(err.message)
        setSets([])
      })

  useEffect(() => {
    load()
  }, [clientId])

  const copyUrl = async (key, url) => {
    const ok = await copyText(url)
    setCopied(ok ? key : '')
    setTimeout(() => setCopied(''), 2000)
  }

  const download = (file, sizeKey) => {
    const a = document.createElement('a')
    a.href = file.url
    a.download = `${clientName.replace(/\W+/g, '-').toLowerCase()}-${sizeKey}.png`
    a.target = '_blank'
    a.rel = 'noopener'
    a.click()
  }

  const remove = async (set) => {
    if (!confirm(`Delete all ${set.ordered.length} sizes of this ad? This cannot be undone.`)) return
    setBusy(set.stamp)
    setError('')
    try {
      await deleteSavedAd(set, clientId)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  if (sets === null) return <p className="text-sm text-slate-500">Loading saved ads...</p>

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {sets.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-3xl mb-2">🖼️</p>
          <p className="text-slate-900 font-medium">Nothing saved yet</p>
          <p className="text-sm text-slate-500 mt-1">
            Build an ad on the Design tab and hit &ldquo;Save all 3 sizes&rdquo;. Saved ads land here
            and in the client&rsquo;s Files.
          </p>
        </div>
      ) : (
        sets.map((set) => (
          <div key={set.stamp} className="border border-slate-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2 gap-2">
              <p className="text-xs font-medium text-slate-600 truncate">
                {when(set.savedAt)}
                {set.recipe?.hook && (
                  <span className="ml-2 font-normal text-slate-500">{set.recipe.hook}</span>
                )}
              </p>
              <div className="flex items-center gap-3 flex-shrink-0">
              {onPublish && (
                <button
                  onClick={() => onPublish(set)}
                  title="Create this as a paused ad in the client's Meta account"
                  className="px-2 py-1 rounded bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700 transition"
                >
                  Publish
                </button>
              )}
              {set.recipe ? (
                <button
                  onClick={() => onEdit?.(set.recipe)}
                  className="px-2 py-1 rounded bg-orange-600 text-white text-[11px] font-medium hover:bg-orange-700 transition"
                >
                  Edit
                </button>
              ) : (
                <span
                  title="Saved before the Studio started keeping the text and colours, so there is nothing to reopen."
                  className="text-[11px] text-slate-400"
                >
                  image only
                </span>
              )}
              <button
                onClick={() => remove(set)}
                disabled={busy === set.stamp}
                className="text-[11px] text-slate-400 hover:text-red-600 transition"
              >
                {busy === set.stamp ? 'Deleting...' : 'Delete'}
              </button>
              </div>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1">
              {set.ordered.map(({ size, file }) => {
                const key = `${set.stamp}-${size.key}`
                return (
                  <div key={size.key} className="flex-shrink-0">
                    <img
                      src={file.url}
                      alt={`${size.label} ad for ${clientName}`}
                      loading="lazy"
                      className="border border-slate-300 rounded bg-slate-100 object-cover"
                      style={{ width: size.w / 7, height: size.h / 7 }}
                    />
                    <p className="text-[11px] text-slate-500 mt-1">{size.label}</p>
                    <div className="flex gap-2 mt-0.5">
                      <button
                        onClick={() => copyUrl(key, file.url)}
                        className={`text-[11px] ${
                          copied === key ? 'text-green-700 font-medium' : 'text-blue-600 hover:text-blue-800'
                        }`}
                      >
                        {copied === key ? '✓ Copied' : 'Copy URL'}
                      </button>
                      <button
                        onClick={() => download(file, size.key)}
                        className="text-[11px] text-blue-600 hover:text-blue-800"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
