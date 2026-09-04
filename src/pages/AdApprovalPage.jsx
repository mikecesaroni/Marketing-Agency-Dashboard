import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { decideApproval, loadApproval } from '../lib/adApprovalStore'
import { approvalSummary } from '../lib/adApproval'
import { publicUrl } from '../lib/savedAds'

/**
 * The page a business owner opens to approve creatives before they run.
 *
 * No login: the token in the URL is the credential, exactly as the onboarding
 * link works, and it is read through the ad_approval_load function rather than
 * by reading tables, so a token buys this one approval and nothing else.
 *
 * Built for a phone held one-handed, because that is where it will be opened.
 * One ad per screen-width, big tap targets, no sidebar, nothing to scroll
 * sideways. The comment box only appears once somebody asks for a change --
 * an empty text field next to every ad invites nobody to type in it and makes
 * the page look like work.
 */
export default function AdApprovalPage() {
  const { token } = useParams()
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState('')
  const [drafts, setDrafts] = useState({})

  const load = useCallback(() => {
    loadApproval(token)
      .then(setState)
      .catch((err) => setError(err.message))
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const decide = async (path, decision) => {
    setSaving(path)
    setError('')
    try {
      await decideApproval({ token, storagePath: path, decision, comment: drafts[path] })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving('')
    }
  }

  if (error && !state) {
    return (
      <Shell>
        <p className="text-sm text-red-700">{error}</p>
      </Shell>
    )
  }
  if (!state) {
    return (
      <Shell>
        <p className="text-sm text-slate-500">Loading…</p>
      </Shell>
    )
  }
  if (!state.found) {
    return (
      <Shell>
        <p className="text-base font-semibold text-slate-900">This link is not valid.</p>
        <p className="mt-1 text-sm text-slate-600">
          It may have been replaced by a newer one. Ask for a fresh link.
        </p>
      </Shell>
    )
  }

  const items = state.items || []
  const summary = approvalSummary(items)

  return (
    <Shell>
      <h1 className="text-xl font-bold text-slate-900">
        {state.client_name} — ad approval
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {items.length} {items.length === 1 ? 'ad' : 'ads'} ready to run. Approve each one, or say
        what you would like changed.
      </p>
      {state.note && (
        <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-700">
          {state.note}
        </p>
      )}

      {summary.allApproved && (
        <p className="mt-3 rounded-lg border border-green-200 bg-green-50 p-2.5 text-sm font-medium text-green-900">
          ✓ All {summary.total} approved. Nothing else needed from you — thank you.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-6">
        {items.map((item, i) => {
          const url = publicUrl(item.storage_path)
          const wantsChanges = item.decision === 'changes'
          return (
            <div key={item.storage_path} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-500">
                  Ad {i + 1} of {items.length}
                </p>
                {item.decision === 'approved' && (
                  <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-800">
                    Approved
                  </span>
                )}
                {wantsChanges && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                    Changes asked for
                  </span>
                )}
              </div>

              {/* Opens full size in a new tab: on a phone the small print on a
                  1080px creative is unreadable at page width. */}
              <a href={url} target="_blank" rel="noreferrer">
                <img
                  src={url}
                  alt={`Ad ${i + 1}`}
                  className="w-full rounded-lg border border-slate-100 bg-slate-50"
                />
              </a>

              {item.comment && (
                <p className="mt-2 text-sm text-slate-700">
                  <span className="font-medium">You said:</span> {item.comment}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving === item.storage_path}
                  onClick={() => decide(item.storage_path, 'approved')}
                  className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                    item.decision === 'approved'
                      ? 'bg-green-600 text-white'
                      : 'border border-green-600 text-green-700 hover:bg-green-50'
                  }`}
                >
                  {saving === item.storage_path ? 'Saving…' : 'Approve'}
                </button>
                <button
                  type="button"
                  disabled={saving === item.storage_path}
                  onClick={() =>
                    wantsChanges
                      ? decide(item.storage_path, 'changes')
                      : setDrafts((d) => ({ ...d, [item.storage_path]: d[item.storage_path] ?? '' }))
                  }
                  className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                    wantsChanges
                      ? 'bg-amber-500 text-white'
                      : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Ask for a change
                </button>
              </div>

              {/* Only once they have asked. A comment box under every ad makes
                  the page look like a form to fill in rather than two taps. */}
              {drafts[item.storage_path] !== undefined && !wantsChanges && (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={drafts[item.storage_path]}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [item.storage_path]: e.target.value }))
                    }
                    rows={3}
                    placeholder="What would you like changed?"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={saving === item.storage_path}
                    onClick={() => decide(item.storage_path, 'changes')}
                    className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    {saving === item.storage_path ? 'Sending…' : 'Send this note'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-center text-[11px] text-slate-400">
        The Working Class Marketing
      </p>
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-lg px-4 py-8">{children}</div>
    </div>
  )
}
