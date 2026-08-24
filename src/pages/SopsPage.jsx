import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import SopAttachments from '../components/SopAttachments'
import SopContent from '../components/SopContent'
import SopForm from '../components/SopForm'
import { supabase } from '../lib/supabaseClient'
import { copyText } from '../lib/intakeSummary'

export default function SopsPage() {
  const [sops, setSops] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [editing, setEditing] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    load()
  }, [])

  const load = async (keepId) => {
    const { data, error: err } = await supabase
      .from('sops')
      .select('*')
      .order('pinned', { ascending: false })
      .order('title')

    if (err) {
      setError(err.message)
    } else {
      setSops(data || [])
      setError('')
      setSelectedId((cur) => keepId ?? (cur && data?.some((s) => s.id === cur) ? cur : data?.[0]?.id ?? null))
    }
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return sops
    // Searches the body too — SOPs get looked up by a phrase you half-remember
    // from inside them far more often than by their title.
    return sops.filter((s) =>
      [s.title, s.category, s.content].some((f) => f?.toLowerCase().includes(term))
    )
  }, [sops, search])

  const selected = sops.find((s) => s.id === selectedId)

  const togglePin = async (sop) => {
    await supabase.from('sops').update({ pinned: !sop.pinned }).eq('id', sop.id)
    load(sop.id)
  }

  const handleDelete = async (sop) => {
    if (!confirm(`Delete "${sop.title}"? This can't be undone.`)) return
    await supabase.from('sops').delete().eq('id', sop.id)
    setSelectedId(null)
    load(null)
  }

  const handleCopy = async () => {
    await copyText(`${selected.title}\n\n${selected.content}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const newButton = (
    <button
      onClick={() => setShowNew(true)}
      className="w-full md:w-auto px-4 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition"
    >
      + New SOP
    </button>
  )

  const tableMissing = error.toLowerCase().includes('sops')

  return (
    <Layout title="SOPs" subtitle={`${sops.length} saved`} actions={newButton}>
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 mb-4 text-sm">
          {tableMissing ? (
            <>
              <p className="font-semibold mb-1">The SOPs table doesn't exist yet.</p>
              <p>
                Run <code className="bg-red-100 px-1 rounded">supabase/sops.sql</code> in the
                Supabase SQL Editor, then refresh.
              </p>
            </>
          ) : (
            `Error: ${error}`
          )}
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : sops.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <p className="text-4xl mb-3">📖</p>
          <p className="font-medium text-slate-900">No SOPs yet</p>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Paste in a process however it's written — caps headings, numbered steps, bullets —
            and it gets laid out for you. No special formatting to learn.
          </p>
          <button
            onClick={() => setShowNew(true)}
            className="mt-4 px-4 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition"
          >
            Write your first SOP
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-[260px_1fr] gap-4">
          {/* INDEX */}
          <div className={selected ? 'hidden md:block' : ''}>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SOPs..."
              className="w-full px-3 py-2 mb-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
              {filtered.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">Nothing matches.</p>
              ) : (
                filtered.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full text-left px-3 py-2.5 transition ${
                      s.id === selectedId ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-sm font-medium truncate">
                      {s.pinned && '📌 '}
                      {s.title}
                    </p>
                    {s.category && (
                      <p
                        className={`text-xs truncate ${
                          s.id === selectedId ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {s.category}
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* READER */}
          {selected && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 md:p-8">
              <button
                onClick={() => setSelectedId(null)}
                className="md:hidden mb-3 text-sm text-blue-600"
              >
                ← All SOPs
              </button>

              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5 pb-4 border-b border-slate-200">
                <div className="min-w-0">
                  {selected.category && (
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">
                      {selected.category}
                    </p>
                  )}
                  <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
                    {selected.title}
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    Updated {new Date(selected.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={handleCopy}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition ${
                      copied ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={() => togglePin(selected)}
                    className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition"
                  >
                    {selected.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    onClick={() => setEditing(selected)}
                    className="px-2.5 py-1.5 text-xs font-medium bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300 transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(selected)}
                    className="px-2.5 py-1.5 text-xs font-medium text-red-600 rounded-lg hover:bg-red-50 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <SopContent text={selected.content} />

              <SopAttachments sopId={selected.id} />
            </div>
          )}
        </div>
      )}

      <Modal isOpen={showNew} onClose={() => setShowNew(false)} title="New SOP">
        <SopForm
          onSuccess={(id) => load(id)}
          onClose={() => setShowNew(false)}
          categories={[...new Set(sops.map((s) => s.category).filter(Boolean))]}
        />
      </Modal>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit SOP">
        {editing && (
          <SopForm
            sop={editing}
            onSuccess={(id) => load(id)}
            onClose={() => setEditing(null)}
            categories={[...new Set(sops.map((s) => s.category).filter(Boolean))]}
          />
        )}
      </Modal>
    </Layout>
  )
}
