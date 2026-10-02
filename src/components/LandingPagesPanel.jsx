import { useEffect, useState } from 'react'
import { Card, Input, Select } from './ui'
import { copyText } from '../lib/intakeSummary'
import { PURPOSES, guessPurpose, labelFromUrl, normalizeUrl, pageTitle, pagesText, purposeMeta, shortUrl, sortPages } from '../lib/landingPages'
import { addLandingPage, fetchLandingPages, removeLandingPage, updateLandingPage } from '../lib/landingPagesStore'

// Where this client's ads send people. One list, every page, each with a
// copy button, so nobody has to dig through Slack for "what was the Reliable
// page again". Lives on the client page and, per client, behind the Landing
// pages door on the Content tab.
//
// Removing a row only forgets it here. The page itself, in GoHighLevel or
// wherever it is hosted, is not touched; the CRM has no way to.

const TONE = {
  blue: 'bg-blue-50 text-blue-800 border-blue-200',
  green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
}

function PurposePill({ purpose }) {
  const m = purposeMeta(purpose)
  return <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${TONE[m.tone] || TONE.slate}`}>{m.label}</span>
}

function CopyButton({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await copyText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1200)
      }}
      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
    >
      {done ? 'Copied' : label}
    </button>
  )
}

/** The list and the add form, fed its rows. The panel below loads them. */
export function LandingPagesList({ clientId, clientName, pages, onChange, compact = false }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ url: '', label: '', purpose: '', notes: '' })
  const [editing, setEditing] = useState(null) // a row id
  const [edit, setEdit] = useState(null)
  const [removing, setRemoving] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const rows = sortPages(pages || [])

  const onUrl = (url) => {
    // Fill in a label and purpose from the address, but only what the
    // person has not typed themselves.
    setDraft((d) => ({
      ...d,
      url,
      label: d.labelTouched ? d.label : labelFromUrl(url),
      purpose: d.purposeTouched ? d.purpose : guessPurpose(url) || d.purpose,
    }))
  }

  const add = async () => {
    setBusy(true)
    setError('')
    try {
      await addLandingPage(clientId, { url: draft.url, label: draft.label, purpose: draft.purpose || 'other', notes: draft.notes })
      setDraft({ url: '', label: '', purpose: '', notes: '' })
      setAdding(false)
      onChange?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await updateLandingPage(editing, { url: edit.url, label: edit.label.trim(), purpose: edit.purpose, notes: edit.notes.trim() })
      setEditing(null)
      onChange?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError('')
    try {
      await removeLandingPage(removing)
      setRemoving('')
      onChange?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {rows.length === 0 && !adding && (
        <p className="text-sm text-slate-500">
          No landing pages saved yet. Paste the link the ads send people to, so everyone can find it here.
        </p>
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {rows.map((p) =>
            editing === p.id ? (
              <li key={p.id} className="py-3">
                <PageForm value={edit} onChange={setEdit} />
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" onClick={save} disabled={busy || !normalizeUrl(edit.url)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="text-xs text-slate-500 hover:underline">
                    Cancel
                  </button>
                </div>
              </li>
            ) : (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <PurposePill purpose={p.purpose} />
                    <span className="truncate text-sm font-medium text-slate-900">{pageTitle(p)}</span>
                  </div>
                  <a href={p.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-blue-700 hover:underline" title={p.url}>
                    {shortUrl(p.url)}
                  </a>
                  {p.notes && !compact && <p className="mt-0.5 text-xs text-slate-500">{p.notes}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <CopyButton text={p.url} />
                  <a href={p.url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                    Open ↗
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(p.id)
                      setEdit({ url: p.url, label: p.label || '', purpose: p.purpose || 'other', notes: p.notes || '' })
                      setRemoving('')
                    }}
                    className="px-1 text-xs text-slate-500 hover:text-slate-900 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoving(removing === p.id ? '' : p.id)}
                    aria-label={`Remove ${pageTitle(p)}`}
                    className="px-1 text-xs text-slate-400 hover:text-red-700"
                  >
                    ×
                  </button>
                </div>
                {removing === p.id && (
                  <div className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <span className="flex-1">Forget this page here? The page itself is not touched.</span>
                    <button type="button" onClick={remove} disabled={busy} className="rounded-lg bg-red-700 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40">
                      {busy ? 'Removing…' : 'Remove'}
                    </button>
                    <button type="button" onClick={() => setRemoving('')} className="hover:underline">
                      Keep it
                    </button>
                  </div>
                )}
              </li>
            )
          )}
        </ul>
      )}

      {adding ? (
        <div className={`${rows.length ? 'mt-3 border-t border-slate-100 pt-3' : 'mt-3'}`}>
          <PageForm value={draft} onChange={setDraft} onUrl={onUrl} autoFocus />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={add} disabled={busy || !normalizeUrl(draft.url)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
              {busy ? 'Saving…' : 'Save page'}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-xs text-slate-500 hover:underline">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className={`flex flex-wrap items-center gap-2 ${rows.length ? 'mt-3' : 'mt-2'}`}>
          <button type="button" onClick={() => setAdding(true)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
            + Add a page
          </button>
          {rows.length > 0 && <CopyButton text={pagesText(clientName, rows)} label="Copy all" />}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  )
}

/** Address, what it is for, a name and a note. Shared by add and edit. */
function PageForm({ value, onChange, onUrl, autoFocus = false }) {
  const set = (k, v) => onChange({ ...value, [k]: v, ...(k === 'label' ? { labelTouched: true } : {}), ...(k === 'purpose' ? { purposeTouched: true } : {}) })
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
      <Input
        size="sm"
        autoFocus={autoFocus}
        value={value.url}
        onChange={(e) => (onUrl ? onUrl(e.target.value) : set('url', e.target.value))}
        placeholder="Paste the page link, like https://workingclassgroup.com/your-page"
        aria-label="Page link"
      />
      <Select size="sm" value={value.purpose || 'other'} onChange={(e) => set('purpose', e.target.value)} aria-label="What the page is for">
        {PURPOSES.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </Select>
      <Input size="sm" value={value.label} onChange={(e) => set('label', e.target.value)} placeholder="Name (filled in from the link)" aria-label="Page name" />
      <Input size="sm" value={value.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Note, optional" aria-label="Note" className="sm:col-span-1" />
    </div>
  )
}

/** The client page's panel: loads its own rows. */
export default function LandingPagesPanel({ client }) {
  const [pages, setPages] = useState(null)
  const [error, setError] = useState('')

  const load = () =>
    fetchLandingPages(client.id)
      .then((rows) => {
        setPages(rows)
        setError('')
      })
      .catch((err) => setError(err.message))

  useEffect(() => {
    setPages(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id])

  return (
    <Card id="landing-pages" padding="none" className="p-4 md:p-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900 md:text-xl">
          Landing pages
          {pages && pages.length > 0 && <span className="ml-2 text-sm font-normal text-slate-500">{pages.length}</span>}
        </h2>
        <p className="text-xs text-slate-500">Where the ads send people. Copy a link, or add the new one here so the whole team can find it.</p>
      </div>
      {error && <p className="mb-2 text-xs text-red-700">{error}</p>}
      {pages === null && !error ? <p className="text-sm text-slate-500">Loading…</p> : <LandingPagesList clientId={client.id} clientName={client.name} pages={pages || []} onChange={load} />}
    </Card>
  )
}
