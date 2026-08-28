import { GHL_SETUP_SECTIONS, SELECT_OPTIONS, GHL_REQUIRED_KEYS } from '../lib/ghlSetupFields'

// Renders the GHL setup fields from the shared spec. Presentational only: the
// staff modal and the client-facing page both use this, so the two can never
// ask for different things.
export default function GhlSetupFields({ data, onChange, highlightMissing = [] }) {
  const autoExpand = (e) => {
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 500) + 'px'
  }

  const inputClass = (key) =>
    `w-full px-2 py-1 border rounded text-sm ${
      highlightMissing.includes(key) ? 'border-red-400 bg-red-50' : ''
    }`

  return (
    <>
      {GHL_SETUP_SECTIONS.map((section) => (
        <div key={section.title} className="border-b pb-4">
          <h3 className="font-bold text-slate-900 mb-1">{section.title}</h3>
          {section.blurb && <p className="text-xs text-slate-500 mb-3">{section.blurb}</p>}
          <div className="space-y-2">
            {section.fields.map(([key, label, type, placeholder]) => (
              <div key={key}>
                <label className="text-xs font-medium text-slate-600 block mb-1" htmlFor={`ghl-${key}`}>
                  {label}
                  {GHL_REQUIRED_KEYS.includes(key) && <span className="text-red-500 ml-0.5">*</span>}
                </label>

                {type === 'textarea' ? (
                  <textarea
                    id={`ghl-${key}`}
                    name={key}
                    rows="2"
                    placeholder={placeholder}
                    value={data[key] ?? ''}
                    onChange={onChange}
                    onInput={autoExpand}
                    className={inputClass(key)}
                  />
                ) : type === 'select' ? (
                  <select
                    id={`ghl-${key}`}
                    name={key}
                    value={data[key] ?? ''}
                    onChange={onChange}
                    className={inputClass(key)}
                  >
                    <option value="">Select...</option>
                    {(SELECT_OPTIONS[key] || []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`ghl-${key}`}
                    type={type === 'email' ? 'email' : 'text'}
                    name={key}
                    placeholder={placeholder}
                    value={data[key] ?? ''}
                    onChange={onChange}
                    className={inputClass(key)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
