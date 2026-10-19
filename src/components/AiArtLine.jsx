import { useEffect, useRef, useState } from 'react'
import { AI_TEMPLATE_KEYS, addStyleRef, aiArtUrl, isAiTemplate, listStyleRefs, makeAiArt, removeStyleRef } from '../lib/aiArt'

// The retail posters modelled on the agency's example ads: the first batch to make.
const RETAIL = ['sun_deal', 'clunkers', 'split_pop', 'cloud_price', 'payment_stack', 'rebate_burst', 'feature_list']

/**
 * The line under the template picker that has ChatGPT's image model make the
 * picked template as a finished poster in the style of the example ads
 * (src/lib/aiArt.js), and switches between that and the drawn version. One
 * template takes two pictures (square, and tall for the 4:5 feed and the
 * Story), about a minute or two each. The example ads are listed and
 * managed here too: every client's ChatGPT ads follow them.
 */
export default function AiArtLine({ clientId, content, art, onMade, aiOn, onToggle, templateLabel }) {
  const template = content?.layout
  const mine = art?.[template]
  const [progress, setProgress] = useState(null) // { label, i, n }
  const [error, setError] = useState('')
  const [refs, setRefs] = useState(null)
  const [open, setOpen] = useState(false)
  const stop = useRef(false)
  const fileRef = useRef(null)

  useEffect(() => {
    listStyleRefs().then(setRefs).catch(() => setRefs([]))
  }, [])
  useEffect(() => () => void (stop.current = true), [])

  if (!isAiTemplate(template)) return null

  const run = async (templates) => {
    const jobs = templates.flatMap((t) => [{ t, shape: 'square' }, { t, shape: 'tall' }])
    const each = 'about 25 cents and a minute or two a picture, two pictures a template'
    if (!window.confirm(`Have ChatGPT make ${templates.length === 1 ? 'this template' : `${templates.length} templates`} in the style of the example ads (${jobs.length} pictures, ${each})? The real logo and Google card go on top.`)) return
    stop.current = false
    setError('')
    for (let i = 0; i < jobs.length; i += 2) {
      if (stop.current) break
      const pair = jobs.slice(i, i + 2)
      setProgress({ label: templateLabel(pair[0].t), i: i / 2 + 1, n: templates.length })
      try {
        // Both shapes of one template at once: they do not depend on each other.
        await Promise.all(pair.map((j) => makeAiArt({ clientId, content: { ...content, layout: j.t }, shape: j.shape })))
        await onMade?.()
      } catch (err) {
        setError(err.message)
        break
      }
    }
    setProgress(null)
    onToggle?.(true)
  }

  const addRef = async (file) => {
    if (!file) return
    setError('')
    try {
      await addStyleRef(file)
      setRefs(await listStyleRefs())
    } catch (err) {
      setError(err.message)
    }
  }
  const dropRef = async (r) => {
    if (!window.confirm(`Stop using ${r.name} as an example? Ads already made keep their look.`)) return
    try {
      await removeStyleRef(r.path)
      setRefs(await listStyleRefs())
    } catch (err) {
      setError(err.message)
    }
  }

  const btn = 'rounded border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-800 hover:bg-slate-50'
  const link = 'text-slate-500 underline hover:text-slate-800'
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs text-slate-600" data-ai-art>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-slate-800">ChatGPT version</span>
        {mine ? (
          <label className="flex items-center gap-1.5" data-ai-art-toggle>
            <input type="checkbox" checked={aiOn} onChange={(e) => onToggle?.(e.target.checked)} />
            Use it {aiOn ? '(the artboards show ChatGPT’s design)' : '(showing the drawn version)'}
          </label>
        ) : (
          <span>None for this template yet.</span>
        )}
        {!progress && (
          <button type="button" className={btn} onClick={() => run([template])} data-ai-art-make>
            {mine ? 'Remake it' : 'Make it with ChatGPT'}
          </button>
        )}
        {!progress && (
          <button type="button" className={link} onClick={() => run(RETAIL)} data-ai-art-retail>
            Make the {RETAIL.length} retail posters
          </button>
        )}
        {!progress && (
          <button type="button" className={link} onClick={() => run(AI_TEMPLATE_KEYS)} data-ai-art-all>
            Make all {AI_TEMPLATE_KEYS.length}
          </button>
        )}
        {progress && (
          <button type="button" className={link} onClick={() => (stop.current = true)}>
            Stop after this one
          </button>
        )}
        <button type="button" className={link} onClick={() => setOpen((o) => !o)} data-ai-art-refs-toggle>
          {open ? 'Hide the examples' : `Styled on ${refs ? refs.length : '…'} example ads`}
        </button>
      </div>
      {progress && (
        <p className="mt-1 text-slate-700" data-ai-art-progress>
          <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 align-[-2px]" />
          ChatGPT is making {progress.label}, {progress.i} of {progress.n}. A minute or two each; the artboards switch over when it lands.
        </p>
      )}
      {error && (
        <p className="mt-1 text-red-700" data-ai-art-error>
          {error}
        </p>
      )}
      <p className="mt-1 text-[11px] text-slate-500">
        ChatGPT paints the whole poster with your words and the real unit photo, and leaves a white band at the bottom for the real logo and the Google card. It
        can still misspell a word: read every ad before it goes out, and Remake it if one is off. Change the words, then Remake to put the new words in.
      </p>
      {open && (
        <div className="mt-2" data-ai-art-refs>
          <div className="flex flex-wrap gap-2">
            {(refs || []).map((r) => (
              <figure key={r.path} className="relative w-24">
                <img src={aiArtUrl(r.path)} alt={r.name} className="h-32 w-24 rounded border border-slate-200 bg-white object-contain" />
                <button type="button" onClick={() => dropRef(r)} className="absolute right-1 top-1 rounded bg-white/90 px-1 text-[10px] text-red-700 shadow" title="Stop using this example">
                  Remove
                </button>
              </figure>
            ))}
            <button type="button" onClick={() => fileRef.current?.click()} className="flex h-32 w-24 items-center justify-center rounded border border-dashed border-slate-300 bg-white text-center text-[11px] text-slate-500 hover:bg-slate-50">
              Add an example ad
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => addRef(e.target.files?.[0])} />
          </div>
          <p className="mt-1 text-[11px] text-slate-500">The first six go to ChatGPT with every ad. Shared by every client.</p>
        </div>
      )}
    </div>
  )
}
