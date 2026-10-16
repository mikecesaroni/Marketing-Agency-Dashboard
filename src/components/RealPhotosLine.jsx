import { useEffect, useRef, useState } from 'react'
import { UNIT_PHOTO_KEYS, makeUnitPhoto, unitPhotoLabel, unitPhotoStatus } from '../lib/unitPhotos'

// Where the OPENAI_API_KEY secret goes, for the one-time setup note. The
// project ref is the one in the Supabase URL the app already talks to.
const PROJECT_REF = (() => {
  try {
    return new URL(import.meta.env.VITE_SUPABASE_URL || '').hostname.split('.')[0]
  } catch {
    return ''
  }
})()
const SECRETS_URL = PROJECT_REF ? `https://supabase.com/dashboard/project/${PROJECT_REF}/functions/secrets` : 'https://supabase.com/dashboard'

/**
 * The line under the Equipment row that says how many of the twelve real
 * photos the library has (a new and an old of each unit) and makes the
 * missing ones: one call to the stock-images function per photo, in turn,
 * with the artboards repainting as each lands. Shared by every client, so
 * this is done once for the agency.
 */
export default function RealPhotosLine({ photos, onChanged }) {
  const { have, missing, total } = unitPhotoStatus(photos)
  const [open, setOpen] = useState(false)
  const [progress, setProgress] = useState(null) // { key, i, n }
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const cancel = useRef(false)
  useEffect(() => () => void (cancel.current = true), [])

  const make = async (keys, label) => {
    if (!keys.length) return
    const each = 'about 25 cents each at high quality, about a minute each'
    if (!window.confirm(`${label} ${keys.length} photo${keys.length === 1 ? '' : 's'} with the image model (${each})? They go in the stock library for every client.`)) return
    cancel.current = false
    setError('')
    setDone('')
    let made = 0
    for (let i = 0; i < keys.length; i++) {
      if (cancel.current) break
      setProgress({ key: keys[i], i: i + 1, n: keys.length })
      try {
        await makeUnitPhoto(keys[i])
        made++
        onChanged?.()
      } catch (err) {
        setError(err.message)
        break
      }
    }
    setProgress(null)
    if (made) setDone(`${made} photo${made === 1 ? '' : 's'} made. The templates use them now.`)
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600" data-real-photos>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-slate-700" title="Made with ChatGPT's image model (OpenAI gpt-image-1), once, for every client">
          Real photos <span className="font-normal text-slate-500">(ChatGPT's image model)</span>
        </span>
        <span data-real-photos-count>
          {have.length} of {total} made
          {missing.length ? '; the drawings stand in for the rest' : ''}
        </span>
        {!progress && missing.length > 0 && (
          <button type="button" onClick={() => make(missing, 'Make')} className="rounded border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-800 hover:bg-slate-50" data-make-photos>
            Make the missing {missing.length}
          </button>
        )}
        {!progress && (
          <button type="button" onClick={() => make(UNIT_PHOTO_KEYS, 'Remake')} className="text-slate-500 underline hover:text-slate-800" data-remake-photos>
            Remake all
          </button>
        )}
        {progress && (
          <button type="button" onClick={() => (cancel.current = true)} className="text-slate-500 underline hover:text-slate-800">
            Stop after this one
          </button>
        )}
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-slate-500 underline hover:text-slate-800" data-real-photos-toggle>
          {open ? 'Hide the list' : 'Which ones'}
        </button>
      </div>
      {progress && (
        <p className="mt-1 text-slate-700" data-real-photos-progress>
          <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 align-[-2px]" />
          Making the {unitPhotoLabel(progress.key).toLowerCase()}, {progress.i} of {progress.n}. About a minute each.
        </p>
      )}
      {error && (
        <p className="mt-1 text-red-700" data-real-photos-error>
          {error}
        </p>
      )}
      {error && /OPENAI_API_KEY/.test(error) && (
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-slate-700" data-real-photos-setup>
          <li>
            Make an API key at{' '}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="underline">
              platform.openai.com
            </a>{' '}
            (the same company as ChatGPT; the photos bill to that account, a few cents each).
          </li>
          <li>
            Open{' '}
            <a href={SECRETS_URL} target="_blank" rel="noreferrer" className="underline">
              this project's Edge Function secrets in Supabase
            </a>{' '}
            and add one named <code className="rounded bg-slate-100 px-1">OPENAI_API_KEY</code> with that key.
          </li>
          <li>Come back here and press the button again. Nothing else to set up.</li>
        </ol>
      )}
      {done && !error && <p className="mt-1 text-green-800">{done}</p>}
      {open && (
        <ul className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4" data-real-photos-list>
          {UNIT_PHOTO_KEYS.map((key) => {
            const p = photos?.[key]
            return (
              <li key={key} className="flex items-center gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1">
                <span className="flex h-10 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-white">
                  {p ? <img src={p.url} alt="" className="max-h-10 max-w-8 object-contain" /> : <span className="text-[10px] text-slate-400">none</span>}
                </span>
                <span className="min-w-0 flex-1 truncate" title={unitPhotoLabel(key)}>
                  {unitPhotoLabel(key)}
                </span>
                {!progress && (
                  <button type="button" onClick={() => make([key], p ? 'Remake' : 'Make')} className="text-slate-500 underline hover:text-slate-800" data-make-photo={key}>
                    {p ? 'Redo' : 'Make'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
