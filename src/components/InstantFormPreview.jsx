import { useEffect, useState } from 'react'

/**
 * The instant form as a person sees it on their phone, drawn live from the
 * builder: the intro card with the cover photo, the questions with Meta's
 * prefilled answers already in, the review screen on a Higher Intent form,
 * and the thank-you page. Meta has no preview to embed before the form
 * exists, so this is the Studio's own, kept to the shapes Meta uses: a white
 * sheet, the Page's name over the cover, grey labels, blue buttons. Tap the
 * page names above the phone, or the button on each page, to walk through.
 */

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#1877F2]" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

function Avatar({ name }) {
  const initials = String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
  return (
    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-white ring-2 ring-white" aria-hidden="true">
      {initials || 'FB'}
    </span>
  )
}

function Button({ children, onClick, soft = false }) {
  return (
    <button type="button" onClick={onClick} className={`w-full rounded-lg px-3 py-2.5 text-[13px] font-semibold ${soft ? 'bg-slate-100 text-slate-800' : 'bg-[#1877F2] text-white'}`} data-preview-button>
      {children}
    </button>
  )
}

function Field({ f }) {
  if (f.prefilled) {
    return (
      <div data-preview-field={f.type}>
        <p className="text-[11px] text-slate-500">{f.label}</p>
        <div className="mt-0.5 flex items-center justify-between rounded-md border border-slate-300 px-2.5 py-2 text-[13px] text-slate-900">
          <span>{f.value}</span>
          <span className="text-[10px] text-slate-400">prefilled</span>
        </div>
      </div>
    )
  }
  return (
    <div data-preview-field="CUSTOM">
      <p className="text-[13px] font-semibold text-slate-900">{f.label}</p>
      {f.options.length >= 2 ? (
        <ul className="mt-1.5 space-y-1">
          {f.options.map((o, i) => (
            <li key={`${o}-${i}`} className="flex items-center gap-2 rounded-md border border-slate-300 px-2.5 py-2 text-[13px] text-slate-800">
              <span className={`h-4 w-4 flex-shrink-0 rounded-full border-2 ${i === 0 ? 'border-[#1877F2] bg-[#1877F2] shadow-[inset_0_0_0_2px_white]' : 'border-slate-400'}`} aria-hidden="true" />
              {o}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-1.5 rounded-md border border-dashed border-amber-400 bg-amber-50 px-2.5 py-2 text-[12px] text-amber-800">Typed answer. Add two options to make it a tap.</div>
      )}
    </div>
  )
}

function Privacy({ pageName, url }) {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return ''
    }
  })()
  return (
    <p className="text-[10px] leading-snug text-slate-500">
      By tapping {`"Submit"`}, you agree to send your info to {pageName}, who agrees to use it according to their{' '}
      <span className="text-[#1877F2]">privacy policy{host ? ` (${host})` : ''}</span>. Facebook will also use it subject to our Data Policy.
    </p>
  )
}

export default function InstantFormPreview({ pages, pageName = 'Your business', coverSrc = '', coverNote = '', active, onActive }) {
  const [inner, setInner] = useState(pages[0]?.key || 'questions')
  const current = active ?? inner
  const setCurrent = onActive || setInner
  // A page that disappears (the intro, when the cover and the text go) hands
  // back to the first one.
  useEffect(() => {
    if (!pages.some((p) => p.key === current)) setCurrent(pages[0]?.key || 'questions')
  }, [pages, current, setCurrent])
  const page = pages.find((p) => p.key === current) || pages[0]
  const next = () => {
    const i = pages.findIndex((p) => p.key === page.key)
    if (i >= 0 && i < pages.length - 1) setCurrent(pages[i + 1].key)
  }

  return (
    <div data-form-preview>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {pages.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setCurrent(p.key)}
            aria-pressed={p.key === page?.key}
            data-preview-page={p.key}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${p.key === page?.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {p.label}
          </button>
        ))}
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Live preview
        </span>
      </div>

      {/* The phone. */}
      <div className="mx-auto w-[300px] rounded-[2rem] border-[6px] border-slate-900 bg-slate-900 shadow-xl">
        <div className="relative flex h-[600px] flex-col overflow-hidden rounded-[1.6rem] bg-white text-slate-900">
          <div className="flex items-center justify-between px-3 pt-3 text-[11px] text-slate-500">
            <span aria-hidden="true">✕</span>
            <span className="font-semibold text-slate-700">{pageName}</span>
            <span aria-hidden="true">⋯</span>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3" data-preview-body={page?.key}>
            {page?.key === 'intro' && (
              <div>
                <div className="relative -mx-3 mt-2 aspect-[1.91/1] bg-slate-200">
                  {coverSrc ? (
                    <img src={coverSrc} alt="" className="h-full w-full object-cover" data-preview-cover />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[11px] text-slate-500">Cover photo goes here</div>
                  )}
                  <div className="absolute -bottom-4 left-3">
                    <Avatar name={pageName} />
                  </div>
                </div>
                <p className="mt-6 text-[11px] text-slate-500">{pageName}</p>
                <h3 className="mt-1 text-[17px] font-bold leading-snug text-slate-900" data-preview-title>{page.title}</h3>
                {page.lines.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {page.lines.map((l, i) => (
                      <li key={`${l}-${i}`} className="flex items-start gap-2 text-[13px] leading-snug text-slate-800">
                        {page.lines.length > 1 && <Check />}
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {coverNote && <p className="mt-3 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800">{coverNote}</p>}
              </div>
            )}

            {page?.key === 'questions' && (
              <div className="mt-2 space-y-3">
                {page.headline ? <h3 className="text-[16px] font-bold leading-snug text-slate-900" data-preview-headline>{page.headline}</h3> : null}
                {page.fields.length === 0 ? (
                  <p className="text-[12px] text-slate-500">Tick a question on the left and it appears here.</p>
                ) : (
                  <>
                    {page.fields.some((f) => f.prefilled) && <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Contact information</p>}
                    {page.fields.filter((f) => f.prefilled).map((f) => (
                      <Field key={f.type} f={f} />
                    ))}
                    {page.fields.filter((f) => !f.prefilled).map((f, i) => (
                      <Field key={`${f.label}-${i}`} f={f} />
                    ))}
                  </>
                )}
                <Privacy pageName={pageName} url={page.privacyUrl} />
              </div>
            )}

            {page?.key === 'review' && (
              <div className="mt-2 space-y-3">
                <h3 className="text-[16px] font-bold text-slate-900">Review your info</h3>
                <p className="text-[12px] text-slate-600">Check your answers before sending.</p>
                <dl className="divide-y divide-slate-200 rounded-md border border-slate-200">
                  {page.fields.map((f, i) => (
                    <div key={`${f.label}-${i}`} className="flex items-start justify-between gap-3 px-2.5 py-2 text-[12px]">
                      <dt className="text-slate-500">{f.label}</dt>
                      <dd className="text-right font-medium text-slate-900">{f.prefilled ? f.value : f.options?.[0] || 'Your answer'}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-[10px] text-slate-500">Higher Intent: this screen is what cuts the accidental submits.</p>
              </div>
            )}

            {page?.key === 'thanks' && (
              <div className="mt-10 flex flex-col items-center text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
                <h3 className="mt-3 text-[17px] font-bold text-slate-900">{page.title}</h3>
                <p className="mt-2 text-[13px] leading-snug text-slate-700" data-preview-thanks>{page.body}</p>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white p-3">
            {page?.key === 'thanks' ? (
              page.button ? <Button soft onClick={() => setCurrent(pages[0]?.key)}>{page.button}</Button> : <Button soft onClick={() => setCurrent(pages[0]?.key)}>Done</Button>
            ) : (
              <Button onClick={next}>{page?.button || 'Continue'}</Button>
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-500">How it reads on a phone. The answers in grey are what Meta fills in from the person&rsquo;s profile.</p>
    </div>
  )
}
