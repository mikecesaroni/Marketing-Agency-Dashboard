import { useEffect, useState } from 'react'
import { copyText } from '../lib/intakeSummary'
import { deleteSavedAd, fetchSavedAds } from '../lib/savedAds'
import { adFileName, saveBlob, zipAdSizes, zipFileName } from '../lib/adZip'
import { SIZES } from '../lib/adCanvas'
import { approvalStatusLine, onePerSet, sizesAvailable } from '../lib/adApproval'
import { createApprovalLink, fetchApprovalLinks } from '../lib/adApprovalStore'
import Button from './ui/Button'

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
  const [zipping, setZipping] = useState('')
  // Ads ticked for sending to the owner, by stamp.
  const [picked, setPicked] = useState(() => new Set())
  // Which single size goes to the owner. One per ad, not three: an owner asked
  // to approve four ads does not want twelve crops of them.
  const [sendSize, setSendSize] = useState('square')
  const [note, setNote] = useState('')
  const [links, setLinks] = useState([])
  const [made, setMade] = useState(null)

  const load = () =>
    fetchSavedAds(clientId)
      .then(setSets)
      .catch((err) => {
        setError(err.message)
        setSets([])
      })

  useEffect(() => {
    load()
    fetchApprovalLinks(clientId).then(setLinks).catch(() => setLinks([]))
  }, [clientId])

  const copyUrl = async (key, url) => {
    const ok = await copyText(url)
    setCopied(ok ? key : '')
    setTimeout(() => setCopied(''), 2000)
  }

  const download = (file, sizeKey) => {
    const a = document.createElement('a')
    a.href = file.url
    a.download = adFileName(clientName, sizeKey)
    a.target = '_blank'
    a.rel = 'noopener'
    a.click()
  }

  /**
   * The whole set as one archive.
   *
   * Fetched and zipped rather than three links clicked in a row, which
   * browsers block or mangle from a single gesture. A size that fails to
   * download is reported rather than quietly missing from the zip -- an
   * archive with two files in it looks exactly like one with three.
   */
  const downloadSet = async (set) => {
    setZipping(set.stamp)
    setError('')
    try {
      const entries = []
      const failed = []
      for (const { size, file } of set.ordered) {
        try {
          const res = await fetch(file.url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          entries.push({ sizeKey: size.key, blob: await res.blob() })
        } catch {
          failed.push(size.label)
        }
      }

      const { blob } = await zipAdSizes({ clientName, entries })
      if (!blob) throw new Error('None of the sizes could be downloaded.')
      saveBlob(blob, zipFileName(clientName, set.stamp))
      if (failed.length > 0) setError(`Downloaded without ${failed.join(' and ')} — that size failed to load.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setZipping('')
    }
  }

  const chosen = (sets || []).filter((s) => picked.has(s.stamp))
  // Only offer a size some selected ad actually has. Offering "Story" for a
  // batch where nothing saved at 9:16 would send substitutes without saying so.
  const available = sizesAvailable(chosen.length > 0 ? chosen : sets)
  const toggle = (stamp) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(stamp)) next.delete(stamp)
      else next.add(stamp)
      return next
    })

  /**
   * One image from each ticked ad, in one archive.
   *
   * Zipped rather than several links fired in a row: browsers block or mangle
   * rapid successive downloads from a single gesture, which is the same reason
   * the per-set download already zips.
   */
  const downloadOneEach = async () => {
    const items = onePerSet(chosen, sendSize)
    if (items.length === 0) return
    setZipping('batch')
    setError('')
    try {
      const entries = []
      const failed = []
      for (const item of items) {
        try {
          const res = await fetch(item.url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          // Stamped, so four ads do not become four files with one name that
          // overwrite each other inside the archive.
          entries.push({ sizeKey: `${item.sizeKey}-${item.stamp}`, blob: await res.blob() })
        } catch {
          failed.push(item.stamp)
        }
      }
      const { blob } = await zipAdSizes({ clientName, entries })
      if (!blob) throw new Error('None of the ads could be downloaded.')
      saveBlob(blob, zipFileName(clientName))
      if (failed.length > 0) {
        setError(`${failed.length} of ${items.length} ads failed to download and are not in the zip.`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setZipping('')
    }
  }

  /** A link the owner opens to approve or ask for changes, ad by ad. */
  const makeLink = async () => {
    const items = onePerSet(chosen, sendSize)
    if (items.length === 0) return
    setBusy('link')
    setError('')
    try {
      const link = await createApprovalLink({
        clientId,
        paths: items.map((i) => i.storage_path),
        note,
      })
      setMade(link)
      await copyUrl('made', link.url)
      setLinks(await fetchApprovalLinks(clientId))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
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

      {sets.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">
              Send to the owner for approval
            </p>
            <span className="text-xs text-slate-500">
              {chosen.length === 0
                ? 'Tick the ads you want to send'
                : `${chosen.length} ad${chosen.length === 1 ? '' : 's'} selected`}
            </span>
            {sets.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setPicked((prev) =>
                    prev.size === sets.length ? new Set() : new Set(sets.map((x) => x.stamp))
                  )
                }
                className="text-xs text-slate-500 underline hover:text-slate-800"
              >
                {picked.size === sets.length ? 'Clear' : 'Select all'}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* ONE size, not three. An owner approving four ads should see four
                pictures; three crops each turns the question from "do you like
                these" into "which one of these". */}
            <label className="text-xs text-slate-600">
              Size to send
              <select
                value={sendSize}
                onChange={(e) => setSendSize(e.target.value)}
                className="ml-1.5 px-2 py-1 border border-slate-300 rounded text-xs bg-white"
              >
                {SIZES.filter((sz) => available.includes(sz.key)).map((sz) => (
                  <option key={sz.key} value={sz.key}>
                    {sz.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              disabled={chosen.length === 0 || busy === 'link'}
              onClick={makeLink}
            >
              {busy === 'link' ? 'Making the link…' : '🔗 Make an approval link'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={chosen.length === 0 || zipping === 'batch'}
              onClick={downloadOneEach}
            >
              {zipping === 'batch' ? 'Zipping…' : '⬇ Download one of each'}
            </Button>
          </div>

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for the owner — e.g. these run next week, shout if anything is off"
            className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
          />

          {made && (
            <div className="rounded border border-green-200 bg-green-50 p-2">
              <p className="text-xs font-medium text-green-900">
                Link ready and copied. Send it to the owner.
              </p>
              <p className="mt-1 break-all font-mono text-[11px] text-green-800">{made.url}</p>
            </div>
          )}

          {links.length > 0 && (
            <div className="pt-1 space-y-1">
              <p className="text-[11px] font-semibold text-slate-500">Links already sent</p>
              {links.map((link) => (
                <div key={link.token} className="flex flex-wrap items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => copyUrl(link.token, link.url)}
                    className="text-slate-600 underline hover:text-slate-900"
                  >
                    {copied === link.token ? 'Copied' : 'Copy link'}
                  </button>
                  <span className="text-slate-400">{when(new Date(link.created_at))}</span>
                  {/* Whether they have looked, and what they said. "Not opened
                      yet" is the difference between waiting on them and them
                      never having got it. */}
                  <span className="text-slate-600">
                    {approvalStatusLine(link.items, Boolean(link.opened_at))}
                  </span>
                  {link.items.some((i) => i.comment) && (
                    <span className="text-amber-700">
                      {link.items
                        .filter((i) => i.comment)
                        .map((i) => `“${i.comment}”`)
                        .join(' ')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
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
              <p className="flex min-w-0 items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={picked.has(set.stamp)}
                  onChange={() => toggle(set.stamp)}
                  className="flex-shrink-0"
                  title="Send this ad to the owner"
                />
                <span className="truncate">{when(set.savedAt)}</span>
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
                onClick={() => downloadSet(set)}
                disabled={zipping === set.stamp}
                title={`All ${set.ordered.length} sizes as one zip`}
                className="px-2 py-1 rounded border border-slate-300 bg-white text-[11px] font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 transition"
              >
                {zipping === set.stamp ? 'Zipping…' : `Download all ${set.ordered.length}`}
              </button>
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
