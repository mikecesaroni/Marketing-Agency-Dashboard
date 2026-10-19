import { useEffect, useRef, useState } from 'react'
import { AI_TEMPLATE_KEYS, addStyleRef, aiArtUrl, isAiTemplate, listStyleRefs, makeAiArt, removeStyleRef } from '../lib/aiArt'
import { TEMPLATE_ART_KEYS, makeTemplateArt, templateArtCount } from '../lib/templateArt'
import { themeFor } from '../lib/adTemplateMeta'
import { artKeyFor } from '../../supabase/functions/_shared/aiAds.js'

// The retail posters modelled on the agency's example ads: the first batch to make.
const RETAIL = ['sun_deal', 'clunkers', 'split_pop', 'cloud_price', 'payment_stack', 'rebate_burst', 'feature_list']

// The template art pictures, both shapes of every key: what "Make the ChatGPT templates" paints.
const ART_JOBS = TEMPLATE_ART_KEYS.flatMap((key) => [
  { key, shape: 'square' },
  { key, shape: 'tall' },
])

/**
 * The ChatGPT line under the template picker.
 *
 * First, the ChatGPT templates (src/lib/templateArt.js): ChatGPT paints the
 * art behind every template once (no words), shared by every client, and
 * the templates paint each client's words on it. "Make the ChatGPT
 * templates" paints the ones not made yet, four at a time; "Remake this
 * one's art" repaints the picked template's.
 *
 * Under it, folded away, a whole ad painted by ChatGPT with this ad's words
 * in the picture (src/lib/aiArt.js), and the example ads those follow.
 */
export default function AiArtLine({ clientId, content, art, matched, onMade, aiOn, onToggle, templateLabel, templateArt, onArtMade }) {
  const template = content?.layout
  // Any picture of this template, and whether one carries these exact words.
  const mine = art?.[template]
  const [progress, setProgress] = useState(null) // { label, i, n }
  const [error, setError] = useState('')
  const [refs, setRefs] = useState(null)
  const [open, setOpen] = useState(false)
  const stop = useRef(false)
  const fileRef = useRef(null)
  // The template art: { done, n } while painting.
  const [artProgress, setArtProgress] = useState(null)
  const [artError, setArtError] = useState('')
  const artStop = useRef(false)
  const count = templateArtCount(templateArt)
  const artKey = artKeyFor(template, themeFor(content))
  const hasArt = Boolean(templateArt?.[artKey]?.square || templateArt?.[artKey]?.tall)

  useEffect(() => {
    listStyleRefs().then(setRefs).catch(() => setRefs([]))
  }, [])
  useEffect(() => () => void (stop.current = true), [])

  // Paints the given pictures, four at a time, and reloads the art after each lands.
  const paintArt = async (jobs) => {
    if (!jobs.length) return
    if (!window.confirm(`Have ChatGPT paint ${jobs.length === 1 ? 'this picture' : `${jobs.length} pictures`} of template art (about 25 cents and a minute each)? It is painted once and every client's ads use it; the words stay yours.`)) return
    artStop.current = false
    setArtError('')
    let done = 0
    setArtProgress({ done, n: jobs.length })
    const queue = [...jobs]
    const worker = async () => {
      while (queue.length && !artStop.current) {
        const j = queue.shift()
        try {
          await makeTemplateArt(j.key, j.shape)
          done++
          setArtProgress({ done, n: jobs.length })
          await onArtMade?.()
        } catch (err) {
          setArtError(err.message)
          // No credits, no key: every other picture would fail the same way.
          artStop.current = true
        }
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()])
    setArtProgress(null)
  }
  const missing = ART_JOBS.filter((j) => !templateArt?.[j.key]?.[j.shape])

  const artLine = (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-slate-600" data-template-art>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-slate-800">ChatGPT templates</span>
        <span data-template-art-count>
          {count.made === count.of ? 'All made: every template paints on ChatGPT’s art.' : count.made ? `${count.made} of ${count.of} pictures made.` : 'Not made yet: the templates paint the drawn backgrounds.'}
        </span>
        {!artProgress && missing.length > 0 && (
          <button type="button" className="rounded border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-800 hover:bg-slate-50" onClick={() => paintArt(missing)} data-template-art-make>
            {count.made ? `Make the other ${missing.length}` : 'Make the ChatGPT templates'}
          </button>
        )}
        {!artProgress && isAiTemplate(template) && hasArt && (
          <button type="button" className="text-slate-500 underline hover:text-slate-800" onClick={() => paintArt([{ key: artKey, shape: 'square' }, { key: artKey, shape: 'tall' }])} data-template-art-remake>
            Remake this one’s art
          </button>
        )}
        {artProgress && (
          <button type="button" className="text-slate-500 underline hover:text-slate-800" onClick={() => (artStop.current = true)}>
            Stop after these
          </button>
        )}
      </div>
      {artProgress && (
        <p className="mt-1 text-slate-700" data-template-art-progress>
          <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 align-[-2px]" />
          ChatGPT is painting the template art: {artProgress.done} of {artProgress.n} done, four at a time. The templates switch over as each lands.
        </p>
      )}
      {artError && (
        <p className="mt-1 text-red-700" data-template-art-error>
          {artError}
        </p>
      )}
      <p className="mt-1 text-[11px] text-slate-500">
        ChatGPT paints the art behind every template once (the sunburst, the clouds, the snow, the leaves, the torn paper), shared by every client. Your words,
        prices, the unit photo and the logo go on top, so they are always spelled right and you can change them.
      </p>
    </div>
  )

  if (!isAiTemplate(template)) return artLine

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
    <div className="space-y-2">
      {artLine}
      <details className="rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs text-slate-600" data-ai-art open={Boolean(art?.[template]) || undefined}>
        <summary className="cursor-pointer font-medium text-slate-800">Or have ChatGPT paint this one ad whole, with its words in the picture</summary>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-slate-800">ChatGPT version</span>
          {matched ? (
            <label className="flex items-center gap-1.5" data-ai-art-toggle>
              <input type="checkbox" checked={aiOn} onChange={(e) => onToggle?.(e.target.checked)} />
              Use it {aiOn ? '(the artboards show ChatGPT’s design)' : '(showing the drawn version)'}
            </label>
          ) : mine ? (
            <span data-ai-art-stale>The one made for this template has other words in it, so the drawn version shows.</span>
          ) : (
            <span>None for this template yet.</span>
          )}
          {!progress && (
            <button type="button" className={btn} onClick={() => run([template])} data-ai-art-make>
              {matched ? 'Remake it' : mine ? 'Make it with these words' : 'Make it with ChatGPT'}
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
          ChatGPT paints the whole poster with your words and the real unit photo, and leaves a white band at the bottom for the real logo and the Google stars. It
          can still misspell a word: read every ad before it goes out, and Remake it if one is off. A picture belongs to the words in it: change a word and the drawn
          version shows until it is made again with the new words. Save all 3 ads uses each ad’s own picture the same way.
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
      </details>
    </div>
  )
}
