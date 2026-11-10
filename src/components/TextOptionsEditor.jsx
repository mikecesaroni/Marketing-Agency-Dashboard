import { MAX_TEXT_OPTIONS, MORE_FIELDS, textOptionsLabel } from '../lib/textOptions'

const LABELS = { primary_text: 'primary text', headline: 'headline', description: 'description' }

/**
 * The extra text options on a copy record: up to four more primary texts,
 * headlines and descriptions beside the main ones, which Meta mixes per
 * viewer (Don Air's hand-built ads carry three of each; src/lib/textOptions.js).
 *
 * Sits under the three main fields on the publish page, for a video and for
 * a static alike. Edits go through onCopy as the record's more_* lists; a
 * blank is kept while somebody is typing and dropped on save and publish.
 * "Write 3 of each" asks the copy assistant for the house style and fills
 * the main fields and the extras together.
 */
export default function TextOptionsEditor({ copy = {}, onCopy, onWrite, writing = false, note = '' }) {
  const label = textOptionsLabel(copy)
  const setAt = (field, i, value) => {
    const list = [...(copy[field] || [])]
    list[i] = value
    onCopy({ [field]: list })
  }
  const removeAt = (field, i) => {
    const list = [...(copy[field] || [])]
    list.splice(i, 1)
    onCopy({ [field]: list })
  }
  const add = (field) => {
    const list = [...(copy[field] || [])]
    if (list.length >= MAX_TEXT_OPTIONS - 1) return
    onCopy({ [field]: [...list, ''] })
  }

  return (
    <div className="space-y-1.5 rounded border border-slate-200 bg-slate-50 p-2" data-text-options>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-700">
          <span className="font-semibold">Text options.</span> {label ? `${label}. ` : 'One of each now. '}
          Meta shows each person one of each, mixed.
        </p>
        {onWrite && (
          <button
            type="button"
            disabled={writing}
            onClick={onWrite}
            title="Three primary texts, three headlines and three descriptions in the house style: one emoji up top, a ✅ checklist of proof points. Fills the fields above and the extras here."
            className="text-[11px] font-semibold text-slate-900 underline hover:text-slate-700 disabled:opacity-50"
            data-write-options
          >
            {writing ? 'Writing 3 of each…' : '✨ Write 3 of each'}
          </button>
        )}
      </div>
      {note && (
        <p className="text-[11px] text-slate-600" data-options-note>
          {note}
        </p>
      )}
      {Object.entries(MORE_FIELDS).map(([main, field]) => {
        const list = copy[field] || []
        return (
          <div key={field} className="space-y-1">
            {list.map((value, i) => (
              <div key={i} className="flex items-start gap-1">
                {main === 'primary_text' ? (
                  <textarea
                    value={value}
                    onChange={(e) => setAt(field, i, e.target.value)}
                    rows={3}
                    placeholder={`Primary text ${i + 2}`}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                    data-more={field}
                  />
                ) : (
                  <input
                    value={value}
                    onChange={(e) => setAt(field, i, e.target.value)}
                    placeholder={`${main === 'headline' ? 'Headline' : 'Description'} ${i + 2}`}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                    data-more={field}
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeAt(field, i)}
                  title="Remove this option"
                  className="px-1 text-sm leading-none text-slate-400 hover:text-red-600"
                  aria-label={`Remove ${LABELS[main]} ${i + 2}`}
                >
                  ×
                </button>
              </div>
            ))}
            {list.length < MAX_TEXT_OPTIONS - 1 && (
              <button
                type="button"
                onClick={() => add(field)}
                className="text-[11px] text-slate-600 underline hover:text-slate-900"
                data-add-more={field}
              >
                + another {LABELS[main]}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
