import { useEffect, useRef, useState } from 'react'
import { readWebsite } from '../lib/websiteRead'
import { ageDays, hostOf, shouldAutoRead } from '../lib/websiteProfile'
import { clientContact, websiteHref } from '../lib/clientGlance'

/**
 * The strip across the top of the client chat that says whether the chat has
 * read this client's website, and reads it when it has not.
 *
 * Opening the chat reads the site by itself the first time (and again once
 * the read is two months old), so nobody has to remember to. The fact sheet
 * lands on the client row and goes into the chat's brief from the next
 * message on. "View" shows exactly what the chat was told.
 */
export default function WebsiteMemory({ client, intake, site, onRead }) {
  const onFile = siteOnFile(client, intake, site)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const autoRef = useRef(false)

  const read = async (url) => {
    setReading(true)
    setError('')
    try {
      const fields = await readWebsite(client.id, url)
      onRead(fields)
      setTyped('')
    } catch (err) {
      setError(err.message)
      onRead({ website_profile_error: err.message, website_profile_at: new Date().toISOString() })
    } finally {
      setReading(false)
    }
  }

  useEffect(() => {
    if (autoRef.current) return
    autoRef.current = true
    if (shouldAutoRead(site, onFile)) read()
    // Once per open of the chat, on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const host = hostOf(site.website_profile_url) || hostOf(onFile)
  const age = ageDays(site)
  const failed = error || (!site.website_profile && site.website_profile_error)

  if (reading) {
    return (
      <Strip tone="blue" spaced>
        <span>🌐 Reading {host || 'their website'} so the chat knows it. About a minute, keep chatting.</span>
      </Strip>
    )
  }

  if (!onFile && !site.website_profile) {
    return (
      <Strip tone="slate" spaced>
        <span>🌐 No website on file, so the chat has not read one.</span>
        <form
          className="flex flex-1 gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (typed.trim()) read(typed.trim())
          }}
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="theirsite.com"
            aria-label="Their website"
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px]"
          />
          <button type="submit" disabled={!typed.trim()} className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-white disabled:opacity-40">
            Read it
          </button>
        </form>
        {error && <span className="w-full text-red-700">{error}</span>}
      </Strip>
    )
  }

  return (
    <div className="mb-2">
      <Strip tone={failed ? 'amber' : 'green'}>
        {failed ? (
          <span>🌐 Could not read {host}: {error || site.website_profile_error}</span>
        ) : (
          <span>
            🌐 Knows their website: {host}
            <span className="text-slate-500">
              {' '}· read {age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age} days ago`}
              {site.website_profile_pages?.length ? ` · ${site.website_profile_pages.length} pages` : ''}
            </span>
          </span>
        )}
        <span className="ml-auto flex gap-3">
          {site.website_profile && (
            <button type="button" onClick={() => setOpen((v) => !v)} className="font-medium text-blue-700 hover:text-blue-900">
              {open ? 'Hide' : 'View'}
            </button>
          )}
          <button type="button" onClick={() => read()} className="font-medium text-blue-700 hover:text-blue-900">
            {failed ? 'Try again' : 'Re-read'}
          </button>
        </span>
      </Strip>
      {open && site.website_profile && (
        <pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-sans text-xs text-slate-700">
          {site.website_profile}
        </pre>
      )}
    </div>
  )
}

/** The address the reader would use: typed forms first, then the last one read. */
function siteOnFile(client, intake, site) {
  const raw = clientContact({ client, intake }).website
  const url = raw && !/\s/.test(raw) && /\.[a-z]{2,}/i.test(raw) ? websiteHref(raw) : ''
  return url || site.website_profile_url || ''
}

const TONES = {
  green: 'border-green-200 bg-green-50 text-green-900',
  blue: 'border-blue-200 bg-blue-50 text-blue-900',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
}

function Strip({ tone, spaced, children }) {
  return <div className={`${spaced ? 'mb-2 ' : ''}flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-1.5 text-[11px] ${TONES[tone]}`}>{children}</div>
}
