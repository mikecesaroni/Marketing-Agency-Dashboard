import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import SopContent from './SopContent'

const inputClass =
  'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

export default function SopForm({ sop, categories = [], onSuccess, onClose }) {
  const [title, setTitle] = useState(sop?.title || '')
  const [category, setCategory] = useState(sop?.category || '')
  const [content, setContent] = useState(sop?.content || '')
  const [preview, setPreview] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const payload = {
      title: title.trim(),
      category: category.trim() || null,
      content,
      updated_at: new Date().toISOString(),
    }

    try {
      const { data, error: err } = sop
        ? await supabase.from('sops').update(payload).eq('id', sop.id).select('id').single()
        : await supabase.from('sops').insert(payload).select('id').single()

      if (err) throw err

      onSuccess(data?.id ?? sop?.id)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Title *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
          placeholder="e.g. Onboarding a new client"
          required
          autoFocus
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Category <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={inputClass}
          placeholder="e.g. Onboarding, Meta Ads, Reporting"
          list="sop-categories"
        />
        <datalist id="sop-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-medium text-slate-700">Content</label>
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {preview ? 'Back to editing' : 'Preview'}
          </button>
        </div>

        {preview ? (
          <div className="border border-slate-300 rounded-lg p-4 max-h-80 overflow-y-auto bg-slate-50">
            <SopContent text={content} />
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows="14"
            className={`${inputClass} font-mono text-xs leading-relaxed`}
            placeholder={`Paste or type it however you write it:

SECTION IN CAPS becomes a heading

STEP 1: Do the first thing
1. Numbered lines become steps
2. Like this

- Dashes become bullets
> Lines starting with > become a callout

**Bold** and \`code\` work too. Links and emails turn into links by themselves.`}
          />
        )}
        <p className="text-xs text-slate-500 mt-1">
          No formatting to learn — caps headings, numbered steps and bullets are picked up as you
          write them.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {loading ? 'Saving...' : sop ? 'Save Changes' : 'Create SOP'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 bg-slate-200 text-slate-900 py-2.5 rounded-lg font-medium hover:bg-slate-300 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
