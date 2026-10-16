import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { copyText } from '../lib/intakeSummary'
import { splitOffer } from '../lib/clientChat'
import { FIELD_LABELS, groupByField, suggestCopy } from '../lib/adCopy'
import { extractPalette } from '../lib/logoColours'
import Button from './ui/Button'
import SavedAdsGallery from './SavedAdsGallery'
import LeadFormStudio from './LeadFormStudio'
import ResearchPanel from './ResearchPanel'
import PublishToMetaPanel from './PublishToMetaPanel'
import { fetchPublishedAds } from '../lib/metaPublish'
import { cacheBust, keys } from '../lib/pageCache'
import { overwriteSavedAd, recipeToContent, saveAdRecipe } from '../lib/savedAds'
import { AD_SEASONS, guessAdSeason } from '../lib/adSeason'
import { creativeWarnings } from '../lib/creativeChecks'
import AdImagePicker from './AdImagePicker'
import StockPicker from './StockPicker'
import TemplateGallery from './TemplateGallery'
import SeasonPlaybook from './SeasonPlaybook'
import { bestTemplates, phaseOf, pickTemplate } from '../lib/seasonPlaybook'
import { findBeforeAfterPairs } from '../lib/beforeAfterStore'
import { auditLine } from '../lib/adAudit'
import { CUTOUTS, TEMPLATE_LAYOUTS, THEME_LAYOUTS, isTemplate, kickerFor, themeFor } from '../lib/adTemplateMeta'
import { stockPath } from '../lib/stockLibrary'
import { prepareLogo } from '../lib/logoCutout'
import { resolveImageSrc } from '../lib/driveAssets'
import { heicToJpegBlob, isHeic, jpegName, jpegPath, toUploadable } from '../lib/imageUpload'
import { makeAdBatch } from '../lib/adBatchStore'
import { looseMatch } from '../lib/helpActions'
import { useHelpActions } from '../lib/useHelpActions'
import { BATCH_SIZE, batchReady, lookName, setTitle, snapshotSet } from '../lib/adBatch'
import { adFileName, saveBlob, zipAdSizes, zipFileName } from '../lib/adZip'
import {
  DEFAULT_ACCENT,
  DEFAULT_BADGE,
  DEFAULT_BG,
  DEFAULT_FOCUS,
  DEFAULT_PHOTO,
  FOCUS_LAYOUTS,
  LAYOUTS,
  PHOTO_LOOKS,
  TWO_PHOTO_LAYOUTS,
  dragFocus,
  dragPhoto,
  brandColours,
  SAFE_MODES,
  SIZES,
  canvasToBlob,
  ensureFonts,
  loadImage,
  renderAd,
} from '../lib/adCanvas'

// HEIC is listed so an iPhone photo is not silently missing; it is converted
// to JPEG the moment it is picked (see convertHeic), since no browser but
// Safari can draw one.
const IMAGE_RE = /\.(png|jpe?g|webp|heic|heif)$/i

function publicUrl(path) {
  return supabase.storage.from('client-files').getPublicUrl(path).data.publicUrl
}

/**
 * The full-size artboard, over everything else, while the thumbnail is hovered.
 *
 * The thumbnail is a fifth of the real thing, which is too small to judge a
 * headline wrap or read the proof strip, and the artboards are the whole
 * product. Nothing is re-rendered to show this: the source canvas is already
 * painted at its true 1080px width and only displayed small, so this copies
 * those exact pixels across with one drawImage. Blitting rather than scaling a
 * thumbnail is what makes it sharp, and it means the zoom can never drift out
 * of step with what the artboard actually says.
 *
 * Fixed to the viewport rather than scaled in place because the artboards live
 * in a horizontally scrolling strip inside a modal; anything enlarged in flow
 * gets clipped by one or the other.
 */
function ZoomedArtboard({ source, size, pinned, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const dst = ref.current
    if (!dst || !source) return
    // Match the source exactly, then let CSS fit it to the viewport. Sizing the
    // bitmap to the display size instead would throw away the resolution this
    // exists to show.
    dst.width = size.w
    dst.height = size.h
    dst.getContext('2d').drawImage(source, 0, 0)
  }, [source, size])

  // Escape closes a pinned preview, which is where a hover-only version gets
  // frustrating: you pin it to read something and then cannot get rid of it.
  useEffect(() => {
    if (!pinned) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pinned, onClose])

  return (
    <div
      // Transparent to the mouse unless pinned, so hovering the thumbnail is
      // never interrupted by the thing that hover just opened.
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center gap-2 bg-slate-900/80 p-4 ${
        pinned ? '' : 'pointer-events-none'
      }`}
      onClick={pinned ? onClose : undefined}
    >
      <canvas
        ref={ref}
        className="rounded shadow-2xl bg-slate-100"
        style={{ maxHeight: '86vh', maxWidth: '94vw', width: 'auto', height: 'auto' }}
      />
      <p className="text-xs text-white/80">
        {size.label} · {size.w}&times;{size.h} ·{' '}
        {pinned ? 'click anywhere or press Escape to close' : 'click to keep it open'}
      </p>
    </div>
  )
}

function Artboard({ size, canvasRef, onZoom, onUnzoom, onPin, draggable, onDragPhoto }) {
  // Dragging the photo on the card layout. Deltas are fractions of the
  // preview's on-screen size, which are the same fractions of the 1080px
  // frame, so what you see is where it lands on export. A drag must not
  // also count as the click that pins the zoom overlay.
  const drag = useRef(null)
  const suppressClick = useRef(false)
  const down = (e) => {
    if (!draggable) return
    drag.current = { x: e.clientX, y: e.clientY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e) => {
    const d = drag.current
    if (!d) return
    const rect = e.currentTarget.getBoundingClientRect()
    const dx = (e.clientX - d.x) / rect.width
    const dy = (e.clientY - d.y) / rect.height
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 2) d.moved = true
    d.x = e.clientX
    d.y = e.clientY
    onDragPhoto?.(dx, dy)
  }
  const up = () => {
    if (drag.current?.moved) suppressClick.current = true
    drag.current = null
  }
  const click = () => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    onPin?.()
  }
  return (
    <div className="flex-shrink-0">
      <canvas
        ref={canvasRef}
        onMouseEnter={onZoom}
        onMouseLeave={onUnzoom}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={click}
        // Deliberately no title attribute: a native tooltip paints above every
        // layer on the page, including the zoom overlay this hover just opened,
        // so it lands in the middle of the enlarged ad. The overlay captions
        // itself instead.
        className={`border border-slate-300 rounded bg-slate-100 transition hover:border-orange-400 hover:ring-2 hover:ring-orange-200 ${
          draggable ? 'cursor-move touch-none' : 'cursor-zoom-in'
        }`}
        style={{ width: size.w / 5, height: size.h / 5 }}
      />
      <p className="text-[11px] text-slate-400 mt-1">
        {size.label} {size.w}&times;{size.h}
      </p>
    </div>
  )
}

/**
 * Ask for better copy without leaving the artboard.
 *
 * Deliberately returns options rather than rewriting the ad in place. The model
 * never touches the fields; it proposes, and a click applies one value to one
 * slot. That keeps it out of the position of quietly editing an ad somebody is
 * halfway through building, and it makes every change one undo away.
 */
function CopyAssistant({ client, current, onApply, undoable, onUndo }) {
  const [open, setOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState(null)
  const [error, setError] = useState('')

  const ask = async (text) => {
    const asked = (text ?? instruction).trim()
    if (!asked || busy) return
    setBusy(true)
    setError('')
    try {
      setReply(await suggestCopy({ client, current, instruction: asked }))
      setInstruction('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left px-3 py-2 rounded-lg border border-dashed border-slate-300 text-xs text-slate-600 hover:border-orange-400 hover:text-slate-900 transition"
      >
        Ask Claude for better copy — sharper hooks, a subhead that adds something
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">Ask for better copy</p>
        <button onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-800">
          Close
        </button>
      </div>

      <div className="flex gap-2">
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
          placeholder="Give me three sharper hooks…"
          disabled={busy}
          className="flex-1 px-3 py-2 border border-slate-300 rounded text-sm disabled:bg-slate-100"
        />
        <button
          onClick={() => ask()}
          disabled={busy || !instruction.trim()}
          className="px-3 py-2 bg-slate-900 text-white rounded text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition"
        >
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </div>

      {/* The three things anyone asks for, one click instead of typing them. */}
      {!busy && !reply && (
        <div className="flex flex-wrap gap-1.5">
          {[
            ['Sharper hooks', 'Give me three sharper hooks. Same offer, same facts.'],
            [
              'Fix the subhead',
              'The subhead should add a different fact than the hook, not restate it. Three options.',
            ],
            [
              'Rewrite for Meta',
              'Rewrite the primary text, headline and description for the feed. The first line of the primary text has to carry the hook on its own.',
            ],
          ].map(([label, prompt]) => (
            <button
              key={label}
              onClick={() => ask(prompt)}
              className="px-2.5 py-1 rounded-full bg-white border border-slate-300 text-[11px] text-slate-700 hover:border-slate-500 transition"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </p>
      )}

      {reply && (
        <div className="space-y-2">
          {reply.note && <p className="text-xs text-slate-700 whitespace-pre-wrap">{reply.note}</p>}

          {groupByField(reply.options).map((group) => (
            <div key={group.field}>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                {FIELD_LABELS[group.field] || group.field}
              </p>
              <ul className="space-y-1">
                {group.options.map((option, i) => (
                  <li key={i}>
                    <button
                      onClick={() => onApply(group.field, option.value)}
                      className="w-full text-left px-2.5 py-1.5 rounded border border-slate-200 bg-white hover:border-orange-400 hover:bg-orange-50 transition"
                    >
                      <span className="block text-xs text-slate-900">{option.value}</span>
                      {option.why && (
                        <span className="block text-[11px] text-slate-500 mt-0.5">{option.why}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => setReply(null)}
              className="text-[11px] text-slate-500 underline hover:text-slate-800"
            >
              Clear suggestions
            </button>
            {undoable && (
              <button
                onClick={onUndo}
                className="text-[11px] text-orange-700 underline hover:text-orange-900"
              >
                Undo “{FIELD_LABELS[undoable.field] || undoable.field}”
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// The small toggle chips in the Background and Equipment rows.
function chipClass(on) {
  return `px-2 py-1 rounded text-[11px] font-medium transition ${on ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'}`
}

function Field({ label, value, onChange, hint }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}
        {hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
      />
    </div>
  )
}

const TABS = [
  // First, because looking at what already works is where an ad starts.
  ['research', 'Research'],
  ['design', 'Design'],
  ['saved', 'Saved ads'],
  // Before Publish on purpose: the form has to exist first in practice,
  // because a GoHighLevel workflow is wired to its id and that is step
  // one, not an afterthought once the ad is built.
  ['form', 'Lead form'],
  ['publish', 'Publish'],
]

/**
 * The Studio takes the whole screen.
 *
 * It lived in a 4xl modal, which was fine for a form and wrong for a design
 * tool: three artboards, a photo picker, a copy assistant and the publish
 * flow all fighting for 56rem with the client page showing through the
 * edges. A dark header carries the client, the five tabs and the close;
 * the body scrolls on its own, so the sticky bits inside (the launch strip,
 * the artboards) stick to this frame rather than to the page underneath.
 *
 * The page's scroll is locked while it is open, and put back on close.
 */
function StudioFrame({ client, tab, setTab, onClose, onBack, backLabel = 'Back', children }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-100">
      <header className="relative flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 bg-slate-950 px-4 py-2.5 text-white md:px-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(249,115,22,0.35),transparent_55%)]" />
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="relative flex-shrink-0 rounded-lg border border-white/20 px-2.5 py-1 text-xs font-medium text-white/90 transition hover:bg-white/10"
          >
            ← {backLabel}
          </button>
        )}
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-lg shadow-lg shadow-orange-900/40">
            ✦
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-300">Ad Studio</p>
            <h2 className="truncate text-base font-bold leading-tight">{client.name}</h2>
          </div>
        </div>
        <nav className="relative order-last w-full md:order-none md:mx-auto md:w-auto" aria-label="Studio tabs">
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-white/10 p-1 backdrop-blur">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                  tab === key ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>
        <button
          type="button"
          onClick={onClose}
          title="Close the Studio"
          className="relative ml-auto grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-2xl leading-none text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          ×
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1600px] px-4 py-4 md:px-6 md:py-5">{children}</div>
      </div>
    </div>
  )
}

// A colour input with the logo's own colours offered underneath, so matching
// the brand is a click rather than an eyedropper and a hex code.
function ColourField({ label, value, onChange, swatches }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[38px] w-14 border border-slate-300 rounded cursor-pointer"
      />
      {swatches.length > 0 && (
        <div className="flex gap-1 mt-1">
          {swatches.slice(0, 5).map((hex) => (
            <button
              key={hex}
              title={`${hex} from the logo`}
              onClick={() => onChange(hex)}
              style={{ background: hex }}
              className={`w-4 h-4 rounded-sm border transition ${
                value.toUpperCase() === hex.toUpperCase()
                  ? 'border-slate-900 ring-1 ring-slate-900'
                  : 'border-slate-300 hover:border-slate-500'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// When copy arrives from the chat, the parts that do NOT go on the image still
// matter: the primary text and description are the ad copy in the feed, and the
// design brief says what background the model had in mind.
function SeedBanner({ seed, from = 'From chat', index }) {
  const title = index === undefined ? `${from}: ${seed.hookAngle || 'creative set'}` : `${from} ${index + 1}: ${seed.hookAngle || 'creative set'}`
  return (
    <details className="rounded-lg border border-orange-200 bg-orange-50 p-3">
      <summary className="cursor-pointer text-sm font-medium text-orange-900">
        {title}
      </summary>
      <div className="mt-2 space-y-2 text-xs text-slate-700">
        {seed.backgroundNote && (
          <div>
            <p className="font-semibold text-slate-600">Background photo to look for</p>
            <p className="whitespace-pre-wrap">{seed.backgroundNote}</p>
          </div>
        )}
        {seed.designBrief && (
          <div>
            <p className="font-semibold text-slate-600">Design brief</p>
            <p className="whitespace-pre-wrap">{seed.designBrief}</p>
          </div>
        )}
        {seed.primaryText && (
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-600">
                Primary text (goes in Meta, not on the image)
              </p>
              <button
                onClick={() => copyText(seed.primaryText)}
                className="text-[11px] text-blue-600 hover:text-blue-800"
              >
                Copy
              </button>
            </div>
            <p className="whitespace-pre-wrap">{seed.primaryText}</p>
          </div>
        )}
      </div>
    </details>
  )
}

/**
 * "Make 3 ads": the strip above the artboards while a batch is being written,
 * then one chip per ad to switch between them, and the one button that saves
 * them all. Each chip names the angle and the look. The chat wrote the words
 * in the client's own thread, so the same three are also in the chat.
 */
function BatchStrip({ batch, client, count, saving, onShow, onSave, onRetry, onDismiss }) {
  const ready = batch.status === 'done' && batchReady(batch.sets)
  return (
    <div className="rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-3" data-batch data-status={batch.status}>
      {batch.status === 'working' && (
        <div className="flex items-center gap-3 text-sm text-orange-900">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-orange-300 border-t-orange-700" />
          <span>
            <span className="font-semibold">Making {count === 1 ? 'an ad' : `${count} ads`} for {client.name}.</span> Reading the brief, the offer, the reviews and
            what has worked, the season playbook, looking through their photos (uploads and Drive), then writing {count === 1 ? 'it' : `${count} angles`}. About half a minute.
          </span>
        </div>
      )}
      {batch.status === 'failed' && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-red-800">
          <span>
            <span className="font-semibold">The {count} ads did not come back.</span> {batch.error}
          </span>
          <button onClick={onRetry} className="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-medium hover:bg-red-50" data-batch-retry>
            Try again
          </button>
          <button onClick={onDismiss} className="text-xs text-slate-500 underline hover:text-slate-800">
            Design by hand instead
          </button>
        </div>
      )}
      {batch.status === 'done' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-semibold text-orange-900">{batch.sets.length === 1 ? 'An ad' : `${batch.sets.length} ads`} for {client.name}</span>
          {batch.sets.map((s, i) => (
            <button
              key={i}
              onClick={() => onShow(i)}
              data-batch-set={i}
              aria-pressed={i === batch.active}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                i === batch.active ? 'border-slate-900 bg-slate-900 text-white' : 'border-orange-300 bg-white text-slate-800 hover:bg-orange-100'
              }`}
              title={s.hook}
            >
              {setTitle(s, i)} <span className={i === batch.active ? 'text-slate-300' : 'text-slate-500'}>· {lookName(s.layout)}</span>
            </button>
          ))}
          <span className="hidden text-[11px] text-slate-500 md:inline">Edit any of them; the words and the look stay with that ad.</span>
          <div className="ml-auto flex items-center gap-2">
            {batch.saved ? (
              <span className="text-xs font-medium text-green-800">All {batch.sets.length} saved</span>
            ) : (
              <button
                onClick={onSave}
                disabled={saving || !ready}
                data-batch-save
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                title="Every ad in three sizes, to the Saved ads tab"
              >
                {saving ? 'Saving…' : batch.sets.length === 1 ? 'Save the ad' : `Save all ${batch.sets.length} ads`}
              </button>
            )}
            <button onClick={onDismiss} className="text-xs text-slate-500 underline hover:text-slate-800" title="Keep what is on the artboards, drop the strip">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// The proof strip is a fact about the client, not something to retype per ad.
/**
 * AI concepts: whole ads made by Higgsfield from the brief on this screen,
 * four at a time, each a different scene and arrangement of the same words.
 * A pick becomes the background under the "AI concept" look and is saved
 * like any other ad. The batches persist per client, so a good one from
 * last week is still here.
 */
function proofFromIntake(intake) {
  const rating = intake?.reviews_star_rating
  if (!rating) return ''
  const count = Number(String(intake.reviews_count || '').replace(/\D/g, ''))
  return count ? `\u2605 ${rating} on Google \u00b7 ${count} reviews` : `\u2605 ${rating} on Google`
}

export default function AdStudioPanel({ client, intake, seed, initialTab, initialVideo, onClose, onBack, backLabel, make = 0, ads = [] }) {
  const [files, setFiles] = useState([])
  // "Make 3 ads" from the Content tab: the chat writes three creative sets,
  // the Studio shows them one at a time with a strip to switch, and one click
  // saves all three. `sets` carry every edit made on them; `active` is the one
  // on the artboards; the active set is what the Design tab is seeded with.
  const [batch, setBatch] = useState(() => (make ? { status: 'working', sets: [], active: 0, error: '' } : null))
  const [batchSeed, setBatchSeed] = useState(null)
  // The HEIC path being converted to JPEG right now, for the picker's label.
  const [converting, setConverting] = useState('')
  // Mirrors clients.drive_folder_id so linking a folder updates the pickers
  // without a page reload.
  const [driveFolderId, setDriveFolderId] = useState(client.drive_folder_id || '')
  const [backgroundPath, setBackgroundPath] = useState('')
  // The second photo of a before-and-after: the "After" half. Only the
  // before look reads it; it is saved with the ad (saved_ads.background_path_2).
  const [afterPath, setAfterPath] = useState('')
  // The logo the CRM remembers for this client (clients.logo_path). A new ad
  // starts with it, so nobody picks the same logo every time. Picking or
  // uploading a logo updates it; Forget clears it.
  const [rememberedLogo, setRememberedLogo] = useState(client.logo_path || '')
  const [logoPath, setLogoPath] = useState(client.logo_path || '')
  const rememberLogo = async (path) => {
    setRememberedLogo(path || '')
    const { error: err } = await supabase.from('clients').update({ logo_path: path || null }).eq('id', client.id)
    if (err) setError(`The logo was used but not remembered: ${err.message}`)
    // The client list and page cache carry the client row.
    cacheBust(keys.client(client.id))
    cacheBust(keys.clients())
  }
  // A logo picked or uploaded on purpose becomes the remembered one.
  const chooseLogo = (path) => {
    setLogoPath(path)
    if (path && path !== rememberedLogo) rememberLogo(path)
  }
  // The client's colours where the intake captured them, ours where it did
  // not. Stated colours are treated as a decision, which is why the logo
  // sampling below leaves them alone.
  //
  // Memoised on the two values rather than on the intake object, which is a
  // fresh object on every render of the page above and would restart the
  // effect below forever.
  const stated = useMemo(
    () => brandColours(intake),
    [intake?.brand_color_primary, intake?.brand_color_secondary]
  )
  const [accent, setAccent] = useState(DEFAULT_ACCENT)
  const [badgeColor, setBadgeColor] = useState(DEFAULT_BADGE)

  // The season playbook (src/lib/seasonPlaybook.js): what this trade sells
  // right now in this market, and which templates say it best.
  const tradeIndustry = intake?.industry_trade || client.industry || ''
  const tradeMarket = intake?.service_area || client.market || ''
  const phase = useMemo(() => phaseOf({ industry: tradeIndustry, market: tradeMarket }), [tradeIndustry, tradeMarket])

  // The intake is fetched by the page above, so on first render it is usually
  // still null -- initialising the state from it would read the defaults and
  // never look again. Applied when it arrives instead, and only over a colour
  // nobody has touched, so reopening the Studio does not overwrite a choice.
  useEffect(() => {
    if (stated.accent) setAccent((c) => (c === DEFAULT_ACCENT ? stated.accent : c))
    if (stated.badge) setBadgeColor((c) => (c === DEFAULT_BADGE ? stated.badge : c))
  }, [stated])

  const [badge, setBadge] = useState('')
  const [hook, setHook] = useState('')
  const [offerAmount, setOfferAmount] = useState('')
  const [offerDetail, setOfferDetail] = useState('')
  const [subhead, setSubhead] = useState('')
  const [proof, setProof] = useState('')

  // Copy that is never painted on the artboard: the primary text sits above
  // the image in the feed, the headline and description below it. These used to
  // be display-only in the chat banner — publishing needs them stored.
  const [primaryText, setPrimaryText] = useState('')
  const [metaHeadline, setMetaHeadline] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  // Off by default: the scrim handles most photos, and a plate on a clean
  // background is just a box.
  const [hookPlate, setHookPlate] = useState(false)
  // Or a smaller one behind the subhead only, when the hook reads fine and
  // the small line is the one fighting the photo. One or the other.
  const [subheadPlate, setSubheadPlate] = useState(false)
  const panel = hookPlate ? 'hook' : subheadPlate ? 'subhead' : 'none'
  const choosePanel = (key) => {
    setHookPlate(key === 'hook')
    setSubheadPlate(key === 'subhead')
  }
  // Photo layout. 'cover' unless somebody switches it; see LAYOUTS in adCanvas.
  const [layout, setLayout] = useState('cover')
  // The template extras (adTemplates.js): the season word or the shout above
  // the headline, the words in the sticker, up to four offer tiles, the piece
  // of equipment in the corner and the painted background. Empty means the
  // template's own default: the season's kicker and theme, the main offer as
  // the one tile, no equipment.
  const [kicker, setKicker] = useState('')
  const [sticker, setSticker] = useState('')
  const [offers, setOffers] = useState([])
  const [cutout, setCutout] = useState('')
  const [theme, setTheme] = useState('')
  const [stockOpen, setStockOpen] = useState(false)
  // The season playbook's last applied pick, for the help chat's state.
  const [suggestion, setSuggestion] = useState(null)
  // The before-and-after finder: { status: 'working' | 'done' | 'error', pairs, looked, how, error }.
  const [finder, setFinder] = useState(null)
  // THE OVERLAP AUDIT (src/lib/adAudit.js): per artboard, every pair of
  // things that overlap and everything past the edge on the last paint.
  // Nothing saves while this has entries, short of "Save anyway".
  const [problems, setProblems] = useState([])
  const [saveAnyway, setSaveAnyway] = useState(false)
  const [bgColor, setBgColor] = useState(DEFAULT_BG)
  const [photo, setPhoto] = useState(DEFAULT_PHOTO)
  // Cover layout: which spot on the photo the crop keeps. Dragging any
  // artboard moves it, and all three sizes follow, so pulling the square down
  // until both faces show fixes the portrait and the Stories crop with it.
  const [focus, setFocus] = useState(DEFAULT_FOCUS)
  // The free band each artboard last painted the photo into, so a drag on the
  // preview moves the photo by the same amount the pointer moved.
  const bands = useRef([])

  // Meta's interface covers the top and bottom of a 9:16. Reels is the
  // strictest of the placements, so it is the default: a CTA hidden behind the
  // caption row is worse than one sitting higher up the frame.
  const [safeMode, setSafeMode] = useState('reels')
  // The season label the saved ad gets. '' means guess from the copy and the
  // date at save time; the gallery can change it afterwards.
  const [season, setSeason] = useState('')
  const [guides, setGuides] = useState(false)
  const [swatches, setSwatches] = useState([])
  // Set once the colours came from the logo, so a later logo change can replace
  // them without stamping over a colour picked by hand.
  const [fromLogo, setFromLogo] = useState(false)
  // Set when a person picks or uploads a logo, cleared once its colours have
  // been read. A logo chosen on purpose recolours the ad even if the accent
  // was already set by a chat recipe or an intake colour: picking a logo IS
  // the instruction. Colours restored from a saved ad or a seed do not set it.
  const logoChosen = useRef(false)
  // The Next-up bar opens the Studio straight on the Publish tab when the ads
  // are built and publishing is the move; everyone else lands on Design.
  const [tab, setTab] = useState(initialTab || 'design')
  const frame = (body) => (
    <StudioFrame client={client} tab={tab} setTab={setTab} onClose={onClose} onBack={onBack} backLabel={backLabel}>
      {body}
    </StudioFrame>
  )
  // Bumped after a save so the gallery refetches instead of showing a stale list.
  const [savedAt, setSavedAt] = useState(0)
  // The saved set the Publish tab is working on, picked from the gallery.
  // Opened straight onto a clip (the board's "click to publish"): the
  // publish flow starts with it ticked rather than at the gallery.
  const [publishing, setPublishing] = useState(initialVideo ? 'blank' : null)
  const [published, setPublished] = useState([])

  // Which artboard is showing full size, and whether it was clicked open
  // rather than hovered. Pinning matters for the 9:16: reading the bottom of a
  // tall frame means moving the mouse off the thumbnail that opened it.
  const [zoom, setZoom] = useState(null)
  const [zoomPinned, setZoomPinned] = useState(false)

  const [assets, setAssets] = useState({ background: null, logo: null })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')
  // The saved ad open for editing, if any. Saving writes over it; nothing is
  // duplicated. Cleared by "Save as a new ad" or "Stop editing".
  const [editing, setEditing] = useState(null)
  const [zipping, setZipping] = useState(false)

  const refs = useRef(SIZES.map(() => null))
  const intakeProof = useMemo(() => proofFromIntake(intake), [intake])
  // What the account's own results say about this ad, shown under the fields
  // while it is being built. Warnings, never blocks: the data is one account
  // over one summer, and the person building the ad may know why this one is
  // the exception.
  const warnings = useMemo(
    () => creativeWarnings({ hook, offerAmount, offerDetail, subhead, proof }),
    [hook, offerAmount, offerDetail, subhead, proof]
  )

  // Every slot the copy assistant is allowed to write, and the setter for each.
  // Nothing outside this map can be applied, whatever comes back.
  const SLOT_SETTERS = {
    badge: setBadge,
    hook: setHook,
    offerAmount: setOfferAmount,
    offerDetail: setOfferDetail,
    subhead: setSubhead,
    proof: setProof,
    primaryText: setPrimaryText,
    headline: setMetaHeadline,
    description: setMetaDescription,
  }
  const slots = {
    badge,
    hook,
    offerAmount,
    offerDetail,
    subhead,
    proof,
    primaryText,
    headline: metaHeadline,
    description: metaDescription,
  }

  // One level, and only for suggestions: what a click replaced, so a hook you
  // liked better is one click back rather than retyped from memory.
  const [undoSlot, setUndoSlot] = useState(null)

  const applySuggestion = (field, value) => {
    const set = SLOT_SETTERS[field]
    if (!set) return
    setUndoSlot({ field, previous: slots[field] ?? '' })
    set(value)
  }

  // Prefill from intake so the first render is a real ad, not empty boxes.
  // Skipped when the chat handed us copy: that copy is the whole point.
  // A batch that landed keeps its words even after the strip is dismissed; a
  // batch that failed and was dismissed gets the intake prefill like any
  // other empty Studio.
  const batchLanded = useRef(false)
  useEffect(() => {
    if (!intake || seed || batch || batchLanded.current) return
    const city = (intake.target_cities || intake.service_area || '').split(/[\n,]/)[0]?.trim()
    setBadge(city || '')
    setHook(city ? `${city} homeowners: is your system ready?` : 'Is your system ready?')
    const offer =
      (intake.current_offers_guarantees || intake.cta_offering || '')
        .split('\n')[0]
        ?.replace(/^[-•\s]+/, '') || ''
    const { amount, detail } = splitOffer(offer)
    setOfferAmount(amount)
    setOfferDetail(detail)
    setSubhead('Catch small problems before they become major breakdowns.')
    setProof(intakeProof)
  }, [intake, seed, batch])

  // Copy handed over from the chat, already mapped onto the slots. The same
  // path serves a batch set, which also carries a look and a photo.
  const applied = seed || batchSeed
  useEffect(() => {
    if (!applied) return
    setHook(applied.hook || '')
    setOfferAmount(applied.offerAmount || '')
    setOfferDetail(applied.offerDetail || '')
    setSubhead(applied.subhead || '')
    setProof(applied.proof || '')
    setPrimaryText(applied.primaryText || '')
    setMetaHeadline(applied.headline || '')
    setMetaDescription(applied.description || '')
    // Neither the location nor the star rating belongs to a creative set, so
    // the intake stays the source for those unless the brief overrode them.
    if (applied.badge) setBadge(applied.badge)
    setProof(applied.proof || intakeProof)
    // Only when the set actually named a colour. Anything else leaves the
    // studio default, or a colour already pulled off the logo, alone.
    if (applied.accent) {
      setAccent(applied.accent)
      setFromLogo(false)
    }
    if (applied.badgeColor) {
      setBadgeColor(applied.badgeColor)
      setFromLogo(false)
    }
    if (applied.layout) setLayout(applied.layout)
    if (applied.backgroundPath !== undefined) setBackgroundPath(applied.backgroundPath || '')
    // The template extras and the second photo, when the set carries them
    // (a batch set does; a creative set from the chat leaves them alone).
    if (applied.backgroundPath2 !== undefined) setAfterPath(applied.backgroundPath2 || '')
    if (applied.kicker !== undefined) setKicker(applied.kicker || '')
    if (applied.sticker !== undefined) setSticker(applied.sticker || '')
    if (applied.offers !== undefined) setOffers(Array.isArray(applied.offers) ? applied.offers : [])
    if (applied.cutout !== undefined) setCutout(applied.cutout || '')
    if (applied.theme !== undefined) setTheme(applied.theme || '')
  }, [applied, intakeProof])

  // The batch itself: asked for once, on mount, when the Studio was opened
  // with "Make N ads". The first set lands on the artboards as soon as the
  // reply is in; the others wait on the strip.
  useEffect(() => {
    if (!make) return
    let cancelled = false
    makeAdBatch({ client, intake, ads, count: make })
      .then((sets) => {
        if (cancelled) return
        batchLanded.current = true
        setBatch({ status: 'done', sets, active: 0, error: '' })
        setBatchSeed(sets[0])
      })
      .catch((err) => {
        if (cancelled) return
        setBatch({ status: 'failed', sets: [], active: 0, error: err.message })
      })
    return () => {
      cancelled = true
    }
    // Once: the client and the count are fixed for the life of this Studio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id, make])

  // The Studio's fields as the active batch set, so switching away keeps the
  // edits made on it, and "Save all" paints what was seen, not what came back.
  const fieldsNow = () => ({
    badge,
    hook,
    offerAmount,
    offerDetail,
    subhead,
    proof,
    primaryText,
    headline: metaHeadline,
    description: metaDescription,
    accent,
    badgeColor,
    layout,
    backgroundPath,
    backgroundPath2: afterPath,
    kicker,
    sticker,
    offers,
    cutout,
    theme,
  })
  const batchWithEdits = () => {
    if (!batch || batch.status !== 'done') return batch
    const sets = batch.sets.map((s, i) => (i === batch.active ? snapshotSet(s, fieldsNow()) : s))
    return { ...batch, sets }
  }
  const showSet = (i) => {
    const cur = batchWithEdits()
    if (!cur || !cur.sets[i]) return
    setBatch({ ...cur, active: i })
    setBatchSeed(cur.sets[i])
    setSaved('')
    setError('')
  }
  // Try again after a failure, or ask for a batch from the help chat.
  const startBatch = (count = make || BATCH_SIZE, { template = '', about = '' } = {}) => {
    setBatch({ status: 'working', sets: [], active: 0, error: '' })
    makeAdBatch({ client, intake, ads, count, template, about })
      .then((sets) => {
        batchLanded.current = true
        setBatch({ status: 'done', sets, active: 0, error: '' })
        setBatchSeed(sets[0])
      })
      .catch((err) => setBatch({ status: 'failed', sets: [], active: 0, error: err.message }))
  }

  // The client's uploaded images. Reloadable, because the Studio stays
  // mounted under the chat and the Files section: a photo added there, or
  // from a phone, has to be reachable without a page reload.
  const loadFiles = () =>
    supabase
      .from('client_files')
      .select('id, file_name, storage_path')
      .eq('client_id', client.id)
      .order('date_uploaded', { ascending: false })
      .then(({ data }) => setFiles((data || []).filter((f) => IMAGE_RE.test(f.storage_path))))

  useEffect(() => {
    loadFiles()
  }, [client.id])

  /**
   * Replaces an uploaded HEIC with its JPEG, in place: same client_files row,
   * same stamp, .jpg. The browser fetches the HEIC bytes from the public
   * bucket, decodes them with libheif and uploads the JPEG; the HEIC object
   * is then removed so the bucket does not carry two copies of every phone
   * photo. Returns the new path, which the caller picks.
   */
  const convertHeic = async (path) => {
    const row = files.find((f) => f.storage_path === path)
    const { data: pub } = supabase.storage.from('client-files').getPublicUrl(path)
    const res = await fetch(pub.publicUrl)
    if (!res.ok) throw new Error(`Could not read ${row?.file_name || path} from storage (${res.status}).`)
    const jpeg = await heicToJpegBlob(await res.blob())
    const newPath = jpegPath(path)
    const newName = jpegName(row?.file_name || path.split('/').pop())
    const { error: upErr } = await supabase.storage.from('client-files').upload(newPath, jpeg, { contentType: 'image/jpeg', upsert: true })
    if (upErr) throw upErr
    if (row?.id) {
      const { error: rowErr } = await supabase
        .from('client_files')
        .update({ file_name: newName, file_type: 'image/jpeg', file_size: jpeg.size, storage_path: newPath })
        .eq('id', row.id)
      if (rowErr) throw rowErr
    }
    await supabase.storage.from('client-files').remove([path])
    setFiles((cur) => cur.map((f) => (f.storage_path === path ? { ...f, file_name: newName, storage_path: newPath } : f)))
    return newPath
  }

  // A pick that lands on a HEIC converts it first, so what gets drawn and
  // later sent to Meta is always a JPEG.
  const pick = (setPath) => async (path) => {
    if (!isHeic(path)) return setPath(path)
    setError('')
    setConverting(path)
    try {
      setPath(await convertHeic(path))
    } catch (err) {
      setError(`Could not convert that iPhone photo: ${err.message}`)
    } finally {
      setConverting('')
    }
  }

  // What has already gone to Meta, so the Publish tab can warn before creating
  // a second copy of the same ad. A missing published_ads table means the
  // migration has not been run yet, which is not worth failing the Studio over.
  useEffect(() => {
    fetchPublishedAds(client.id)
      .then(setPublished)
      .catch(() => setPublished([]))
  }, [client.id])

  // The label a save writes: the pick, or a guess from the words and the date.
  // Also what the templates read for their season (the snow, the leaves, the
  // kicker) while the pick is on Auto.
  const seasonGuess = () =>
    guessAdSeason({
      content: { badge, hook, offerAmount, offerDetail, subhead, proof, primaryText, headline: metaHeadline, description: metaDescription },
      savedAt: Date.now(),
      market: intake?.service_area || client.market || '',
    })
  const seasonToSave = () => season || seasonGuess().season

  // Reload the bitmaps whenever a pick changes.
  useEffect(() => {
    let cancelled = false
    // A pick is either a storage path or `drive:<fileId>`, so the URL has to be
    // resolved before the bitmap can load. Drive resolves to a blob: URL, which
    // is same-origin and so cannot taint the canvas that toBlob() has to read.
    const bitmap = async (path) => (path ? loadImage(await resolveImageSrc(client.id, path)) : null)

    Promise.all([bitmap(backgroundPath), bitmap(logoPath), bitmap(afterPath), bitmap(stockPath(cutout))])
      .then(([background, logo, after, cutoutImage]) => {
        if (cancelled) return
        // The logo with its white box knocked out, for the templates
        // (src/lib/logoCutout.js); the photo looks keep the original.
        setAssets({ background, logo, after, cutoutImage, logoCut: logo ? prepareLogo(logo) : null })
        setError('')

        if (!logo) {
          setSwatches([])
          return
        }
        const palette = extractPalette(logo, null)
        if (!palette) return
        setSwatches(palette.swatches || [])
        // Only claim the colours if they are still the defaults or came from a
        // previous logo. A colour the user chose is theirs to keep -- and so is
        // one the client gave us on the intake, which is a stated brand colour
        // rather than a guess sampled off an image.
        const untouched =
          !stated.accent &&
          !stated.badge &&
          (fromLogo || (accent === DEFAULT_ACCENT && badgeColor === DEFAULT_BADGE))
        const chosen = logoChosen.current
        logoChosen.current = false
        if (chosen || untouched) {
          setAccent(palette.accent)
          setBadgeColor(palette.badge)
          setFromLogo(true)
        }
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [backgroundPath, logoPath, afterPath, cutout, client.id])

  // What the artboards paint: the words, the colours, the look and the
  // template extras. One object, memoised, so the template gallery repaints
  // when something on it changes and not on every render.
  const seasonNow = seasonToSave()
  const paintContent = useMemo(
    () => ({ badge, hook, offerAmount, offerDetail, subhead, proof, accent, badgeColor, hookPlate, subheadPlate, layout, bgColor, photo, focus, kicker, sticker, offers, cutout, theme, season: seasonNow }),
    [badge, hook, offerAmount, offerDetail, subhead, proof, accent, badgeColor, hookPlate, subheadPlate, layout, bgColor, photo, focus, kicker, sticker, offers, cutout, theme, seasonNow]
  )

  // Repaint every artboard on any change. Fonts must be ready first or the
  // first paint measures with a fallback face and wraps differently.
  useEffect(() => {
    let cancelled = false
    const content = paintContent
    ensureFonts().then(() => {
      if (cancelled) return
      const found = []
      SIZES.forEach((size, i) => {
        const canvas = refs.current[i]
        if (!canvas) return
        const out = renderAd(canvas, size, content, assets, { safeMode, guides })
        bands.current[i] = out?.band
        found[i] = out?.problems || []
        // For the tests, and for anyone poking at the page.
        canvas.dataset.size = size.key
        canvas.dataset.problems = JSON.stringify(found[i])
      })
      setProblems((prev) => (JSON.stringify(prev) === JSON.stringify(found) ? prev : found))
      setSaveAnyway(false)
    })
    return () => {
      cancelled = true
    }
  }, [paintContent, assets, safeMode, guides])
  const overlapLines = problems.map((list, i) => (list?.length ? auditLine(list, SIZES[i].label) : '')).filter(Boolean)
  const blocked = overlapLines.length > 0 && !saveAnyway

  // Guides are a preview aid. Repaint clean, export, then put them back, so a
  // saved PNG can never carry the red bands into the ad account.
  const withoutGuides = (fn) => async (...args) => {
    const content = paintContent
    const repaint = (g) =>
      SIZES.forEach((size, i) => {
        const c = refs.current[i]
        if (c) bands.current[i] = renderAd(c, size, content, assets, { safeMode, guides: g })?.band
      })
    if (guides) repaint(false)
    try {
      return await fn(...args)
    } finally {
      if (guides) repaint(true)
    }
  }

  // A template from the playbook: the look, and the phase's kicker, unit and
  // (in a hot market, where the calendar misleads) background, only where
  // nothing has been typed.
  const applyTemplate = (key) => {
    setLayout(key)
    if (!kicker && phase.kicker) setKicker(phase.kicker)
    if (!cutout && phase.cutout) setCutout(phase.cutout)
    // A template with no background of its own takes the phase's, so a
    // year-round ad in October still gets the leaves (and a hot market in
    // January does not get snow).
    const own = TEMPLATE_LAYOUTS.find((t) => t.key === key)?.theme
    if (!theme && !own && phase.theme) setTheme(phase.theme)
  }
  // The template the words on the form call for, live, and the ranking
  // behind it for "Next best".
  const livePick = useMemo(
    () => pickTemplate({ phase, content: paintContent, hasPhoto: Boolean(assets.background), hasAfter: Boolean(assets.after) }),
    [phase, paintContent, assets.background, assets.after]
  )
  const suggestTemplate = () => {
    applyTemplate(livePick.key)
    setSuggestion(livePick)
    return livePick
  }
  const nextBest = () => {
    const ranked = livePick.ranked.filter((r) => r.score > -10)
    const at = ranked.findIndex((r) => r.key === layout)
    const next = ranked[(at + 1) % ranked.length]
    if (!next) return
    applyTemplate(next.key)
    setSuggestion({ key: next.key, reason: next.why.length ? next.why[next.why.length - 1] : 'next down the ranking' })
  }
  // Real before-and-after pairs among the uploads and the Drive photos.
  const findPairs = async () => {
    setFinder({ status: 'working' })
    try {
      const out = await findBeforeAfterPairs({ client, intake })
      setFinder({ status: 'done', ...out })
      return out
    } catch (err) {
      setFinder({ status: 'error', error: err.message })
      throw err
    }
  }
  const applyPair = async (pair) => {
    await pick(setBackgroundPath)(pair.before.path)
    await pick(setAfterPath)(pair.after.path)
    if (!TWO_PHOTO_LAYOUTS.includes(layout)) applyTemplate('before_sale')
  }

  /**
   * Reopens a saved ad for editing.
   *
   * Saving afterwards writes OVER the same ad: same stamp, same three files,
   * same recipe row. An edit is an edit, not a sibling. This is safe for a
   * live ad because meta-publish uploads the bytes to Meta and the ad runs on
   * Meta's copy; the approval link is the one reader of the bucket, and it is
   * meant to show the fix. "Save as a new ad" is there for a real variant.
   */
  const editSaved = (set) => {
    const row = set?.recipe || set
    const r = recipeToContent(row)
    setEditing(set?.recipe ? set : null)
    setBadge(r.badge)
    setHook(r.hook)
    setOfferAmount(r.offerAmount)
    setOfferDetail(r.offerDetail)
    setSubhead(r.subhead)
    setProof(r.proof)
    setPrimaryText(r.primaryText)
    setMetaHeadline(r.headline)
    setMetaDescription(r.description)
    if (r.accent) setAccent(r.accent)
    if (r.badgeColor) setBadgeColor(r.badgeColor)
    setHookPlate(Boolean(r.hookPlate))
    setSubheadPlate(Boolean(r.subheadPlate))
    setLayout(r.layout || 'cover')
    setBgColor(r.bgColor || DEFAULT_BG)
    setPhoto(r.photo || DEFAULT_PHOTO)
    setFocus(r.focus || DEFAULT_FOCUS)
    // Colours came from the saved ad, so a logo reload must not replace them.
    setFromLogo(false)
    setBackgroundPath(r.backgroundPath)
    setAfterPath(r.backgroundPath2 || '')
    setLogoPath(r.logoPath)
    setSafeMode(r.safeMode)
    setSeason(r.season || '')
    setKicker(r.kicker || '')
    setSticker(r.sticker || '')
    setOffers(r.offers || [])
    setCutout(r.cutout || '')
    setTheme(r.theme || '')
    setSaved('')
    setError('')
    setTab('design')
  }

  const upload = async (original, setPath) => {
    setError('')
    try {
      // An iPhone HEIC becomes a JPEG before it goes anywhere.
      const file = await toUploadable(original)
      const path = `${client.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('client-files').upload(path, file)
      if (upErr) throw upErr
      const { error: rowErr } = await supabase.from('client_files').insert({
        client_id: client.id,
        file_name: file.name,
        file_type: file.type,
        // NOT NULL in the schema. Omitting it fails the insert, which showed up
        // as a file that uploaded to storage but never appeared in the CRM.
        file_size: file.size,
        storage_path: path,
      })
      // supabase-js returns errors rather than throwing them. Ignoring this is
      // what turned a failed save into a green success message.
      if (rowErr) throw rowErr
      setFiles((f) => [...f, { id: path, file_name: file.name, storage_path: path }])
      setPath(path)
    } catch (err) {
      setError(err.message)
    }
  }

  // Saves all three sizes back into the same public bucket. Public is exactly
  // what Meta's image uploader needs: it fetches the bytes with no auth.
  const contentNow = () => ({
    season: seasonToSave(),
    badge,
    hook,
    offerAmount,
    offerDetail,
    subhead,
    proof,
    accent,
    badgeColor,
    hookPlate,
    subheadPlate,
    layout,
    bgColor,
    photo,
    focus,
    primaryText,
    headline: metaHeadline,
    description: metaDescription,
    kicker,
    sticker,
    offers,
    cutout,
    theme,
  })

  // Writes the artboards over the saved ad that was opened for editing.
  const saveOver = withoutGuides(async () => {
    if (!editing) return
    setSaving(true)
    setSaved('')
    setError('')
    try {
      const blobs = {}
      for (let i = 0; i < SIZES.length; i++) {
        const canvas = refs.current[i]
        if (canvas) blobs[SIZES[i].key] = await canvasToBlob(canvas)
      }
      await overwriteSavedAd({
        clientId: client.id,
        set: editing,
        blobs,
        content: contentNow(),
        backgroundPath,
        backgroundPath2: afterPath,
        logoPath,
        safeMode,
        note: 'Edited in the Studio',
      })
      setSaved('Saved over the original. Same files, same links; nothing was duplicated.')
      setSavedAt(Date.now())
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  })

  const saveAll = withoutGuides(async () => {
    setSaving(true)
    setSaved('')
    setError('')
    try {
      const stamp = Date.now()
      const urls = []
      for (let i = 0; i < SIZES.length; i++) {
        const canvas = refs.current[i]
        if (!canvas) continue
        const blob = await canvasToBlob(canvas)
        const path = `ads/${client.id}/${stamp}-${SIZES[i].key}.png`
        const { error: upErr } = await supabase.storage
          .from('client-files')
          .upload(path, blob, { contentType: 'image/png' })
        if (upErr) throw upErr
        const { error: rowErr } = await supabase.from('client_files').insert({
          client_id: client.id,
          file_name: `ad-${stamp}-${SIZES[i].key}.png`,
          file_type: 'image/png',
          file_size: blob.size,
          storage_path: path,
        })
        if (rowErr) throw rowErr
        urls.push(publicUrl(path))
      }
      // The images are the deliverable; the recipe is what makes them editable
      // later. A missing saved_ads table should not fail a good save.
      try {
        await saveAdRecipe({
          clientId: client.id,
          stamp,
          content: contentNow(),
          backgroundPath,
          backgroundPath2: afterPath,
          logoPath,
          safeMode,
        })
      } catch (recipeErr) {
        console.warn('Ad saved but its recipe was not stored:', recipeErr.message)
      }
      setSaved(`Saved ${urls.length} sizes. Find them any time on the Saved ads tab.`)
      setEditing(null)
      setSavedAt(Date.now())
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  })

  /**
   * Saves every set in the batch, three sizes each, exactly as "Save all 3
   * sizes" does for one: same bucket paths, same client_files rows, same
   * recipe, so the Saved ads tab, the approval link and Publish take them
   * from here. The set on the artboards is read back first so its edits are
   * what gets painted; the others are painted off-screen from their fields.
   */
  const saveBatch = withoutGuides(async () => {
    const cur = batchWithEdits()
    if (!cur || cur.status !== 'done') return
    setSaving(true)
    setSaved('')
    setError('')
    try {
      await ensureFonts()
      const bitmap = async (path) => (path ? loadImage(await resolveImageSrc(client.id, path)) : null)
      const logo = assets.logo || (await bitmap(logoPath))
      const logoCut = assets.logoCut || (logo ? prepareLogo(logo) : null)
      const backgrounds = {}
      const stocks = {}
      let n = 0
      for (let s = 0; s < cur.sets.length; s++) {
        const set = cur.sets[s]
        const bg = set.backgroundPath || ''
        if (!(bg in backgrounds)) backgrounds[bg] = await bitmap(bg)
        const bg2 = set.backgroundPath2 || ''
        if (!(bg2 in backgrounds)) backgrounds[bg2] = await bitmap(bg2)
        const stock = stockPath(set.cutout)
        if (!(stock in stocks)) stocks[stock] = await bitmap(stock)
        const content = {
          season: seasonToSave(),
          badge: set.badge || badge,
          hook: set.hook || '',
          offerAmount: set.offerAmount || '',
          offerDetail: set.offerDetail || '',
          subhead: set.subhead || '',
          proof: set.proof || intakeProof,
          accent: set.accent || accent,
          badgeColor: set.badgeColor || badgeColor,
          hookPlate,
          subheadPlate,
          layout: set.layout || 'cover',
          bgColor,
          photo,
          focus,
          primaryText: set.primaryText || '',
          headline: set.headline || '',
          description: set.description || '',
          kicker: set.kicker || '',
          sticker: set.sticker || '',
          offers: Array.isArray(set.offers) ? set.offers : [],
          cutout: set.cutout || '',
          theme: set.theme || '',
        }
        // Stamps a millisecond apart keep the three ads distinct on the Saved tab.
        const stamp = Date.now() + s
        for (let i = 0; i < SIZES.length; i++) {
          const canvas = document.createElement('canvas')
          renderAd(canvas, SIZES[i], content, { background: backgrounds[bg], logo, logoCut, after: backgrounds[bg2], cutoutImage: stocks[stock] }, { safeMode, guides: false })
          const blob = await canvasToBlob(canvas)
          const path = `ads/${client.id}/${stamp}-${SIZES[i].key}.png`
          const { error: upErr } = await supabase.storage.from('client-files').upload(path, blob, { contentType: 'image/png' })
          if (upErr) throw upErr
          const { error: rowErr } = await supabase.from('client_files').insert({
            client_id: client.id,
            file_name: `ad-${stamp}-${SIZES[i].key}.png`,
            file_type: 'image/png',
            file_size: blob.size,
            storage_path: path,
          })
          if (rowErr) throw rowErr
        }
        try {
          await saveAdRecipe({ clientId: client.id, stamp, content, backgroundPath: bg, backgroundPath2: bg2, logoPath, safeMode })
        } catch (recipeErr) {
          console.warn('Ad saved but its recipe was not stored:', recipeErr.message)
        }
        n++
      }
      setBatch({ ...cur, saved: true })
      setSaved(`Saved ${n} ads, three sizes each. Find them on the Saved ads tab, or send them for approval from there.`)
      setSavedAt(Date.now())
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  })

  // Straight to disk, for the times you want the PNG in hand rather than in
  // the bucket.
  const download = withoutGuides(async (i) => {
    const canvas = refs.current[i]
    if (!canvas) return
    try {
      const blob = await canvasToBlob(canvas)
      saveBlob(blob, adFileName(client.name, SIZES[i].key))
    } catch (err) {
      setError(err.message)
    }
  })

  // All three at once, as one archive.
  //
  // Zipped rather than three downloads fired in a row: browsers block or
  // mangle rapid successive downloads from a single gesture, so the honest
  // one-click version of this is one file.
  const downloadAll = withoutGuides(async () => {
    setZipping(true)
    setError('')
    try {
      const entries = []
      for (const [i, size] of SIZES.entries()) {
        const canvas = refs.current[i]
        if (canvas) entries.push({ sizeKey: size.key, blob: await canvasToBlob(canvas) })
      }
      const { blob, names } = await zipAdSizes({ clientName: client.name, entries })
      if (!blob) throw new Error('None of the artboards could be exported.')
      saveBlob(blob, zipFileName(client.name))
      setSaved(`Downloaded ${names.length} ${names.length === 1 ? 'size' : 'sizes'} as one zip.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setZipping(false)
    }
  })

  // Opens the Publish tab on one saved set. Publishing works from a saved ad
  // rather than the live artboards because Meta fetches the image bytes over
  // HTTP: the public bucket URL only exists once the ad has been saved.
  // WHAT THE HELP CHAT CAN DO IN THE STUDIO: read the ad, change the words,
  // switch the look, pick a photo, save, and drive a "Make N ads" batch.
  useHelpActions('studio', {
    label: `Ad Studio for ${client.name}`,
    state: () => ({
      client: client.name,
      tab,
      look: layout,
      looks: LAYOUTS.map((l) => l.key),
      words: { badge, hook, offerAmount, offerDetail, subhead, proof, primaryText, headline: metaHeadline, description: metaDescription },
      colours: { accent, badgeColor },
      panel: panel === 'none' ? 'none' : panel === 'hook' ? 'behind hook and subhead' : 'behind subhead only',
      season_playbook: {
        phase: phase.label,
        summary: phase.summary,
        tactics: phase.tactics,
        offers_that_fit: phase.offers,
        leave_out: phase.avoid,
        best_templates: bestTemplates(phase, { hasPhoto: Boolean(assets.background), hasAfter: Boolean(assets.after) }).map((t) => `${t.key}: ${t.why}`),
      },
      overlaps: overlapLines.length ? overlapLines : 'none: nothing overlaps or runs past the edge',
      template_for_these_words: `${livePick.key}: ${livePick.reason}`,
      last_applied_pick: suggestion ? `${suggestion.key}: ${suggestion.reason}` : 'none',
      before_after_finder: finder ? { status: finder.status, pairs: (finder.pairs || []).map((p) => `${p.before.name} -> ${p.after.name} (${p.what})`), error: finder.error } : 'not run',
      template_extras: isTemplate(layout)
        ? {
            kicker: kicker || `(auto: ${kickerFor({ season: seasonNow })})`,
            sticker: sticker || '(none)',
            offer_tiles: offers.length ? offers : '(the main offer as one tile)',
            equipment: cutout || 'none',
            background: theme || `(auto: ${themeFor({ layout, season: seasonNow })})`,
            equipment_choices: [...CUTOUTS.map((c) => c.key), 'stock:<path> from the stock library'],
            background_choices: THEME_LAYOUTS.map((t) => t.key),
          }
        : undefined,
      photo: backgroundPath || 'none picked',
      after_photo: TWO_PHOTO_LAYOUTS.includes(layout) ? afterPath || 'none picked (this before-and-after look needs one)' : undefined,
      logo: logoPath ? 'set' : 'none',
      photos_available: files.map((f) => f.file_name),
      batch: batch
        ? { status: batch.status, ads: batch.sets.map((s, i) => `${i + 1}: ${s.hook || ''} (${lookName(s.layout)})`), showing: batch.active + 1, saved: Boolean(batch.saved), error: batch.error || undefined }
        : null,
      editing_saved_ad: Boolean(editing),
      last_save: saved || '',
      error: error || '',
    }),
    tools: [
      {
        name: 'studio_set',
        description: 'Change the words or colours of the ad on the artboards. Only the fields given change. Colours are hex.',
        input_schema: {
          type: 'object',
          properties: {
            badge: { type: 'string' },
            hook: { type: 'string' },
            offerAmount: { type: 'string' },
            offerDetail: { type: 'string' },
            subhead: { type: 'string' },
            proof: { type: 'string' },
            primaryText: { type: 'string' },
            headline: { type: 'string' },
            description: { type: 'string' },
            accent: { type: 'string' },
            badgeColor: { type: 'string' },
            panel: { type: 'string', enum: ['none', 'hook', 'subhead'], description: 'A card behind the words: none, behind the hook and subhead, or behind the subhead only' },
            kicker: { type: 'string', description: 'Templates only: the shout above the headline (FALL SPECIAL, MASSIVE DEALS). Empty means the season\'s.' },
            sticker: { type: 'string', description: 'Templates only: the words in the starburst or seal (EASY FINANCING, 24/7). Empty means none.' },
            offers: { type: 'array', description: 'Templates only: up to four offer tiles. Empty means the main offer as one tile.', items: { type: 'object', properties: { amount: { type: 'string' }, detail: { type: 'string' } } } },
            cutout: { type: 'string', description: `Templates only: the equipment in the corner: none, ${CUTOUTS.map((c) => c.key).join(', ')}, or stock:<path> from the stock library.` },
            theme: { type: 'string', description: `Templates only: the painted background: auto, ${THEME_LAYOUTS.map((t) => t.key).join(', ')}.` },
          },
        },
        run: (i) => {
          const setters = { badge: setBadge, hook: setHook, offerAmount: setOfferAmount, offerDetail: setOfferDetail, subhead: setSubhead, proof: setProof, primaryText: setPrimaryText, headline: setMetaHeadline, description: setMetaDescription, kicker: setKicker, sticker: setSticker }
          const changed = []
          for (const [key, fn] of Object.entries(setters)) {
            if (typeof i[key] === 'string') { fn(i[key]); changed.push(key) }
          }
          if (typeof i.accent === 'string' && /^#[0-9a-f]{6}$/i.test(i.accent)) { setAccent(i.accent); setFromLogo(false); changed.push('accent') }
          if (typeof i.badgeColor === 'string' && /^#[0-9a-f]{6}$/i.test(i.badgeColor)) { setBadgeColor(i.badgeColor); setFromLogo(false); changed.push('badgeColor') }
          if (['none', 'hook', 'subhead'].includes(i.panel)) { choosePanel(i.panel); changed.push('panel') }
          if (Array.isArray(i.offers)) {
            setOffers(i.offers.slice(0, 4).map((o) => ({ amount: String(o?.amount || ''), detail: String(o?.detail || '') })))
            changed.push('offers')
          }
          if (typeof i.cutout === 'string') {
            const key = i.cutout.trim()
            if (key === '' || key === 'none') { setCutout(''); changed.push('cutout') }
            else if (CUTOUTS.some((c) => c.key === key) || key.startsWith('stock:')) { setCutout(key); changed.push('cutout') }
            else return { error: `No equipment called ${key}. Choices: none, ${CUTOUTS.map((c) => c.key).join(', ')}, stock:<path>.` }
          }
          if (typeof i.theme === 'string') {
            const key = i.theme.trim()
            if (key === '' || key === 'auto') { setTheme(''); changed.push('theme') }
            else if (THEME_LAYOUTS.some((t) => t.key === key)) { setTheme(key); changed.push('theme') }
            else return { error: `No background called ${key}. Choices: auto, ${THEME_LAYOUTS.map((t) => t.key).join(', ')}.` }
          }
          return { ok: true, changed }
        },
      },
      {
        name: 'studio_look',
        description: `Switch the look. Photo looks: ${PHOTO_LOOKS.map((l) => `${l.key} (${l.label})`).join(', ')}. Templates (painted seasonal posters with SALE, prices, stickers and equipment; they read kicker, sticker, offers, cutout and theme): ${LAYOUTS.filter((l) => l.group === 'template').map((l) => `${l.key} (${l.label}: ${l.hint})`).join('; ')}.`,
        input_schema: { type: 'object', properties: { look: { type: 'string', enum: LAYOUTS.map((l) => l.key) } }, required: ['look'] },
        run: ({ look }) => {
          if (!LAYOUTS.some((l) => l.key === look)) return { error: `No look called ${look}.` }
          setLayout(look)
          return { ok: true }
        },
      },
      {
        name: 'studio_suggest_template',
        description: 'Pick the best template for the words on the form, the season playbook and the photos picked, and apply it. Returns the template and why.',
        input_schema: { type: 'object', properties: {} },
        run: () => {
          const s = suggestTemplate()
          return { ok: true, template: s.key, reason: s.reason }
        },
      },
      {
        name: 'studio_find_before_after',
        description: "Look through the client's uploads and Drive photos for real before-and-after pairs (by file name first, then by looking at the photos). With apply (default true) the first pair goes on the artboards on a before-and-after template. Takes up to half a minute.",
        input_schema: { type: 'object', properties: { apply: { type: 'boolean' } } },
        run: async ({ apply = true } = {}) => {
          const out = await findPairs()
          if (!out.pairs.length) return { ok: true, pairs: [], note: `No real pair among the ${out.looked} photos. Ask for a before and an after to be uploaded, or named job-before and job-after.` }
          if (apply) await applyPair(out.pairs[0])
          return { ok: true, pairs: out.pairs.map((p) => ({ before: p.before.name, after: p.after.name, what: p.what })), applied: apply ? out.pairs[0].what : undefined }
        },
      },
      {
        name: 'studio_pick_photo',
        description: "Use one of the client's uploaded photos, by file name (loosely matched): as the background (slot \"photo\", the default, which is the Before half on the before-and-after look) or as the After half (slot \"after\").",
        input_schema: { type: 'object', properties: { name: { type: 'string' }, slot: { type: 'string', enum: ['photo', 'after'] } }, required: ['name'] },
        run: async ({ name, slot }) => {
          const found = looseMatch(files, name, (f) => f.file_name)
          if (found.length !== 1) return { error: found.length ? `Several photos match: ${found.map((f) => f.file_name).join(', ')}` : `No photo called ${name}. Photos: ${files.map((f) => f.file_name).join(', ') || 'none uploaded'}` }
          await pick(slot === 'after' ? setAfterPath : setBackgroundPath)(found[0].storage_path)
          return { ok: true, [slot === 'after' ? 'after_photo' : 'photo']: found[0].file_name }
        },
      },
      {
        name: 'studio_tab',
        description: `Open a tab of the Studio: ${TABS.map((t) => `${t[0]} (${t[1]})`).join(', ')}.`,
        input_schema: { type: 'object', properties: { tab: { type: 'string', enum: TABS.map((t) => t[0]) } }, required: ['tab'] },
        run: ({ tab: t }) => {
          if (!TABS.some((x) => x[0] === t)) return { error: `No tab called ${t}.` }
          setTab(t)
          return { ok: true }
        },
      },
      {
        name: 'studio_save',
        description: 'Save the ad on the artboards in all three sizes to the Saved ads tab (over the saved ad being edited, if one is open).',
        input_schema: { type: 'object', properties: {} },
        run: async () => {
          await (editing ? saveOver : saveAll)()
          return { ok: true, note: 'Saved. It is on the Saved ads tab, ready for an approval link or Publish.' }
        },
      },
      {
        name: 'studio_make_ads',
        description: `Write N ads for this client from their brief and the season playbook, each on the template its words call for, as a batch to review and save together ("Make 3 ads"). Optional: "about" (what the ads should be about, in a sentence: "the $89 furnace tune-up", "a before and after of the Smith job") and "template" (one key: ${LAYOUTS.filter((l) => l.group === 'template').map((l) => l.key).join(', ')}) to write every ad to that template's shape.`,
        input_schema: { type: 'object', properties: { count: { type: 'integer', minimum: 1, maximum: 6 }, about: { type: 'string' }, template: { type: 'string' } } },
        run: ({ count, about, template }) => {
          const key = String(template || '').trim()
          if (key && !isTemplate(key)) return { error: `No template called ${key}.` }
          startBatch(Math.max(1, Math.min(6, Number(count) || BATCH_SIZE)), { template: key, about: String(about || '') })
          return { ok: true, note: 'Writing now; about half a minute. Call page_state to see the result, then studio_save_batch.' }
        },
      },
      {
        name: 'studio_show_set',
        description: 'Put one ad of the batch on the artboards, by its number (1 is the first).',
        input_schema: { type: 'object', properties: { index: { type: 'integer' } }, required: ['index'] },
        run: ({ index }) => {
          const i = Number(index) - 1
          if (!batch?.sets?.[i]) return { error: 'No such ad in the batch.' }
          showSet(i)
          return { ok: true }
        },
      },
      {
        name: 'studio_save_batch',
        description: 'Save every ad in the batch, three sizes each, to the Saved ads tab.',
        input_schema: { type: 'object', properties: {} },
        run: async () => {
          if (!batch || batch.status !== 'done') return { error: batch?.status === 'working' ? 'The batch is still being written; call page_state in a moment.' : 'There is no finished batch to save.' }
          await saveBatch()
          return { ok: true, note: 'Saved all of them. They are on the Saved ads tab.' }
        },
      },
    ],
  })

  const startPublish = (set) => {
    setPublishing(set)
    setTab('publish')
  }

  if (tab === 'saved') {
    return frame(
      <div className="space-y-4">
        <SavedAdsGallery
          client={client}
          key={savedAt}
          clientId={client.id}
          clientName={client.name}
          onEdit={editSaved}
          onPublish={startPublish}
        />
      </div>
    )
  }

  if (tab === 'research') {
    return frame(
      <div className="space-y-3">
        <ResearchPanel client={client} intake={intake} />
      </div>
    )
  }

  if (tab === 'form') {
    return frame(
      <div className="space-y-3">
        <LeadFormStudio client={client} />
      </div>
    )
  }

  if (tab === 'publish') {
    return frame(
      <div className="space-y-4">
        {publishing ? (
          <>
            <button
              onClick={() => setPublishing(null)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              {publishing === 'blank' ? '← Back' : '← Pick a different ad'}
            </button>
            <PublishToMetaPanel
              client={client}
              // 'blank' means the publish flow was opened without a saved
              // image creative, which is how a video-only launch starts.
              set={publishing === 'blank' ? null : publishing}
              initialVideo={initialVideo}
              intake={intake}
              alreadyPublished={published}
              onPublished={() =>
                fetchPublishedAds(client.id)
                  .then(setPublished)
                  .catch(() => {})
              }
            />
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Pick a saved ad to publish, or go straight through to publish a video. Either way it
              goes into {client.name}&rsquo;s Meta account paused — nothing spends until you switch
              it on in Ads Manager.
            </p>
            {/* Without this there is no route to the publish flow for a client
                who has no saved artboards, and videos were unreachable for
                three clients that had them uploaded. */}
            <Button variant="dark" size="lg" onClick={() => setPublishing('blank')}>
              🎬 Publish this week&rsquo;s video
            </Button>
            <SavedAdsGallery
              client={client}
              key={savedAt}
              clientId={client.id}
              clientName={client.name}
              onEdit={editSaved}
              onPublish={startPublish}
            />
          </>
        )}
      </div>
    )
  }

  return frame(
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
      {saved && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          {saved}
        </div>
      )}

      {seed && <SeedBanner seed={seed} />}

      {batch && (
        <BatchStrip
          batch={batch}
          client={client}
          count={make || BATCH_SIZE}
          saving={saving}
          onShow={showSet}
          onSave={saveBatch}
          onRetry={() => startBatch()}
          onDismiss={() => setBatch(null)}
        />
      )}
      {batch?.status === 'done' && batch.sets[batch.active] && <SeedBanner seed={batch.sets[batch.active]} from="Ad" index={batch.active} />}

      {editing && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <span className="font-semibold">Editing a saved ad</span>
          <span>
            from {new Date(Number(editing.stamp)).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.
            Save writes over it; nothing is duplicated.
          </span>
          <button onClick={() => setEditing(null)} className="ml-auto text-[11px] text-blue-700 underline hover:text-blue-900">
            Stop editing
          </button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)] xl:items-start">
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid md:grid-cols-2 gap-3">
        <AdImagePicker
          label={TWO_PHOTO_LAYOUTS.includes(layout) ? 'Before photo' : isTemplate(layout) && !FOCUS_LAYOUTS.includes(layout) ? 'Background photo (this template paints its own)' : 'Background photo'}
          client={client}
          files={files}
          value={backgroundPath}
          onChange={pick(setBackgroundPath)}
          onUpload={(f) => upload(f, setBackgroundPath)}
          onRefresh={loadFiles}
          converting={converting}
          driveFolderId={driveFolderId}
          onFolderSaved={setDriveFolderId}
        />
        {/* The second photo, only on the before-and-after look and templates. */}
        {TWO_PHOTO_LAYOUTS.includes(layout) && (
          <div data-after-picker>
            <AdImagePicker
              label="After photo"
              client={client}
              files={files}
              value={afterPath}
              onChange={pick(setAfterPath)}
              onUpload={(f) => upload(f, setAfterPath)}
              onRefresh={loadFiles}
              converting={converting}
              driveFolderId={driveFolderId}
              onFolderSaved={setDriveFolderId}
            />
          </div>
        )}
        <div>
          <AdImagePicker
            label="Logo"
            client={client}
            files={files}
            value={logoPath}
            onChange={(p) => {
              logoChosen.current = true
              // Clearing the pick does not forget the logo; Forget does.
              return p ? pick(chooseLogo)(p) : setLogoPath('')
            }}
            onUpload={(f) => {
              logoChosen.current = true
              return upload(f, chooseLogo)
            }}
            onRefresh={loadFiles}
            converting={converting}
            driveFolderId={driveFolderId}
            onFolderSaved={setDriveFolderId}
          />
          {/* What the CRM remembers, so the next ad starts with the right logo. */}
          <p className="mt-1 text-[11px] text-slate-500" aria-live="polite">
            {rememberedLogo && logoPath === rememberedLogo ? (
              <>
                <span className="text-green-700">✓ Remembered for {client.name}.</span> New ads start with this logo.{' '}
                <button type="button" onClick={() => rememberLogo('')} className="text-slate-500 underline hover:text-slate-800">
                  Forget
                </button>
              </>
            ) : rememberedLogo ? (
              <>
                A different logo is remembered for {client.name}.{' '}
                <button type="button" onClick={() => { logoChosen.current = true; setLogoPath(rememberedLogo) }} className="text-blue-700 underline hover:text-blue-900">
                  Use the remembered one
                </button>
                {logoPath && (
                  <>
                    {' · '}
                    <button type="button" onClick={() => rememberLogo(logoPath)} className="text-blue-700 underline hover:text-blue-900">
                      Remember this one instead
                    </button>
                  </>
                )}
              </>
            ) : logoPath ? (
              <button type="button" onClick={() => rememberLogo(logoPath)} className="text-blue-700 underline hover:text-blue-900">
                Remember this as {client.name}&apos;s logo
              </button>
            ) : (
              <>No logo remembered yet. Pick or upload one and the CRM keeps it for next time.</>
            )}
          </p>
        </div>
      </div>

      {/* The Drive in its own window, and the before-and-after finder. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600" data-drive-row>
        {driveFolderId ? (
          <a
            href={`https://drive.google.com/drive/folders/${driveFolderId}`}
            target="_blank"
            rel="noreferrer"
            className="text-blue-700 underline hover:text-blue-900"
            data-open-drive
          >
            Open the Drive folder in a new window ↗
          </a>
        ) : (
          <span className="text-slate-400">No Drive folder linked yet (link one on the Drive tab of the photo picker).</span>
        )}
        <a href={`/content/drive/${client.id}`} target="_blank" rel="noreferrer" className="text-blue-700 underline hover:text-blue-900">
          Drive photos in the CRM ↗
        </a>
        <button
          type="button"
          onClick={() => findPairs().catch(() => {})}
          disabled={finder?.status === 'working'}
          title="Looks through the uploads and the Drive photos for two shots of the same job, one before the work and one after: by file name first (job-before, job-after), then by looking at the photos"
          className="px-2 py-1 rounded text-[11px] font-medium text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100 disabled:opacity-50"
          data-find-pairs
        >
          {finder?.status === 'working' ? 'Looking through the photos…' : '🔍 Find before and after pairs'}
        </button>
        {finder?.status === 'error' && <span className="text-red-600">{finder.error}</span>}
        {finder?.status === 'done' && finder.pairs.length === 0 && (
          <span className="text-slate-500" data-no-pairs>
            No real pair among the {finder.looked} photos looked at. Upload a before and an after, or name them job-before and job-after.
          </span>
        )}
      </div>
      {finder?.status === 'done' && finder.pairs.length > 0 && (
        <div className="flex flex-wrap gap-2" data-pairs>
          {finder.pairs.map((p, i) => (
            <button
              key={`${p.before.path}-${p.after.path}`}
              type="button"
              onClick={() => applyPair(p)}
              title={`${p.before.name} then ${p.after.name}. Click to put them on a before-and-after template.`}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 hover:border-slate-500"
              data-pair={i}
            >
              <img src={p.beforeUrl} alt={p.before.name} className="h-14 w-20 rounded object-cover" />
              <span className="text-[10px] text-slate-400">→</span>
              <img src={p.afterUrl} alt={p.after.name} className="h-14 w-20 rounded object-cover" />
              <span className="px-1 text-left text-[11px] text-slate-700">
                {p.what}
                <br />
                <span className="text-slate-400">{p.how === 'names' ? 'by file name' : 'spotted in the photos'}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Field label="Location badge" value={badge} onChange={setBadge} hint="top-left pill" />
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            1 &middot; Hook <span className="font-normal text-slate-400">biggest text, the eye catcher</span>
          </label>
          <textarea
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded text-base font-semibold"
          />
        </div>
        <div className="grid md:grid-cols-3 gap-2">
          <Field
            label="2 · Offer amount"
            value={offerAmount}
            onChange={setOfferAmount}
            hint="$29.95"
          />
          <div className="md:col-span-2">
            <Field label="Offer detail" value={offerDetail} onChange={setOfferDetail} hint="set in caps" />
          </div>
        </div>
        <Field label="Subhead" value={subhead} onChange={setSubhead} />
        <div className="grid md:grid-cols-2 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Field label="Proof strip" value={proof} onChange={setProof} />
              </div>
              {intakeProof && proof !== intakeProof && (
                <button
                  onClick={() => setProof(intakeProof)}
                  className="mt-5 text-[11px] text-blue-600 hover:text-blue-800 whitespace-nowrap"
                >
                  Use intake
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {intakeProof ? `From the intake form: ${intakeProof}` : 'No star rating on the intake form yet.'}
            </p>
          </div>
          <div className="flex gap-3 items-start">
            <ColourField
              label="Offer colour"
              value={accent}
              onChange={(v) => {
                setAccent(v)
                setFromLogo(false)
              }}
              swatches={swatches}
            />
            <ColourField
              label="Badge colour"
              value={badgeColor}
              onChange={(v) => {
                setBadgeColor(v)
                setFromLogo(false)
              }}
              swatches={swatches}
            />
            {swatches.length > 0 && (
              <button
                onClick={() => {
                  setAccent(DEFAULT_ACCENT)
                  setBadgeColor(DEFAULT_BADGE)
                  setFromLogo(false)
                }}
                className="mt-5 text-[11px] text-slate-400 hover:text-slate-700 whitespace-nowrap"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <ul className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1.5">
          {warnings.map((w) => (
            <li key={w.code} className="text-xs text-amber-900 leading-snug">
              <span className="font-semibold">What the account data says:</span> {w.text}
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-lg border border-slate-200 bg-slate-50 p-3" open={Boolean(primaryText)}>
        <summary className="cursor-pointer text-xs font-medium text-slate-700">
          Feed copy — goes in Meta, not on the image
        </summary>
        <div className="mt-2 space-y-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Primary text</label>
            <textarea
              value={primaryText}
              onChange={(e) => setPrimaryText(e.target.value)}
              rows={3}
              placeholder="The paragraph above the image in the feed…"
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
            />
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            <Field
              label="Headline"
              value={metaHeadline}
              onChange={setMetaHeadline}
              hint="under the image"
            />
            <Field
              label="Description"
              value={metaDescription}
              onChange={setMetaDescription}
              hint="optional"
            />
          </div>
          <p className="text-[11px] text-slate-500">
            Saved with the ad, and prefilled on the Publish tab. Until now this text only ever
            appeared in the chat banner and was lost on save.
          </p>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg" data-look-row>
        <span className="text-xs font-medium text-slate-600">Photo looks</span>
        <div className="flex flex-wrap gap-1">
          {PHOTO_LOOKS.map((l) => (
            <button
              key={l.key}
              onClick={() => setLayout(l.key)}
              title={l.hint}
              data-look={l.key}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                layout === l.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
              }`}
            >
              {l.label}
            </button>
          ))}
          {/* The same words in another composition, one click. Skips the AI
              look, which needs a concept picked first. */}
          <button
            onClick={() => {
              const keys = LAYOUTS.map((l) => l.key).filter((k) => k !== 'ai')
              setLayout(keys[(keys.indexOf(layout) + 1) % keys.length])
            }}
            title="Cycle through every look and template with the words as they are"
            className="px-2.5 py-1 rounded text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100"
            data-next-look
          >
            ↻ Next look
          </button>
        </div>
        {FOCUS_LAYOUTS.includes(layout) && (
          <>
            <button onClick={() => setFocus(DEFAULT_FOCUS)} className="text-[11px] text-slate-400 hover:text-slate-700">
              Recentre
            </button>
            <p className="text-[11px] text-slate-500 basis-full">
              {LAYOUTS.find((l) => l.key === layout)?.hint}. Drag the photo on any artboard to choose what the
              crop keeps; the other two sizes follow the same spot.
              {layout === 'stack' && ' Wrap a word in asterisks (*Free* second opinion) to choose the giant word; otherwise a short first word is used.'}
            </p>
          </>
        )}
        {isTemplate(layout) && (
          <p className="text-[11px] text-slate-500 basis-full">
            {LAYOUTS.find((l) => l.key === layout)?.label}: {LAYOUTS.find((l) => l.key === layout)?.hint}.
            {FOCUS_LAYOUTS.includes(layout) ? ' Drag the photo on any artboard to choose what the crop keeps.' : ' The background is painted; the photo picker is kept for when you switch look.'}
          </p>
        )}
        {layout === 'card' && (
          <>
            <ColourField label="Background colour" value={bgColor} onChange={setBgColor} swatches={swatches} />
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Size
              <input
                type="range"
                min="0.25"
                max="1.2"
                step="0.01"
                value={photo.scale ?? DEFAULT_PHOTO.scale}
                onChange={(e) => setPhoto((p) => ({ ...p, scale: Number(e.target.value) }))}
              />
            </label>
            <button onClick={() => setPhoto(DEFAULT_PHOTO)} className="text-[11px] text-slate-400 hover:text-slate-700">
              Recentre
            </button>
            <p className="text-[11px] text-slate-500 basis-full">
              Drag the photo on any artboard to place it; the text stays put. Pick the background from the
              logo swatches or type a hex. On a pale colour the text flips to dark on its own.
            </p>
          </>
        )}
      </div>

      <SeasonPlaybook
        phase={phase}
        best={bestTemplates(phase, { hasPhoto: Boolean(assets.background), hasAfter: Boolean(assets.after) })}
        layout={layout}
        live={livePick}
        onPick={applyTemplate}
        onUseLive={suggestTemplate}
        onNextBest={nextBest}
        onWriteOne={(template) => startBatch(1, { template })}
        writing={batch?.status === 'working'}
        market={tradeMarket}
      />

      <TemplateGallery content={paintContent} assets={assets} safeMode={safeMode} layout={layout} onPick={setLayout} />

      {isTemplate(layout) && (
        <div className="space-y-3 rounded-lg border border-orange-200 bg-orange-50/40 p-3" data-template-fields>
          <div className="grid md:grid-cols-2 gap-2">
            <Field
              label="Kicker"
              value={kicker}
              onChange={setKicker}
              hint={`the shout above the headline; empty paints "${kickerFor({ season: seasonNow })}"`}
            />
            <Field label="Sticker" value={sticker} onChange={setSticker} hint="the words in the starburst or seal: EASY FINANCING, 24/7" />
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Offer tiles <span className="font-normal text-slate-400">up to four prices; empty uses the offer above as the one tile</span>
              </label>
              {offers.length < 4 && (
                <button
                  type="button"
                  onClick={() => setOffers((o) => [...o, { amount: '', detail: '' }])}
                  className="text-[11px] text-blue-700 hover:text-blue-900 whitespace-nowrap"
                  data-add-offer
                >
                  + Add a tile
                </button>
              )}
            </div>
            {offers.length > 0 && (
              <div className="space-y-1">
                {offers.map((o, i) => (
                  <div key={i} className="grid grid-cols-[110px_1fr_auto] gap-1 items-center" data-offer-tile>
                    <input
                      value={o.amount}
                      onChange={(e) => setOffers((list) => list.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                      placeholder="$89"
                      aria-label={`Tile ${i + 1} amount`}
                      className="px-2 py-1.5 border border-slate-300 rounded text-sm font-semibold"
                    />
                    <input
                      value={o.detail}
                      onChange={(e) => setOffers((list) => list.map((x, j) => (j === i ? { ...x, detail: e.target.value } : x)))}
                      placeholder="Furnace tune-up"
                      aria-label={`Tile ${i + 1} detail`}
                      className="px-2 py-1.5 border border-slate-300 rounded text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setOffers((list) => list.filter((_, j) => j !== i))}
                      className="px-1 text-[11px] text-slate-400 hover:text-red-600"
                      title="Remove this tile"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs text-slate-600" data-theme-row>
            <span className="mr-0.5">Background</span>
            {[{ key: '', label: `Auto (${THEME_LAYOUTS.find((t) => t.key === themeFor({ layout, season: seasonNow }))?.label || 'Brand colour'})` }, ...THEME_LAYOUTS].map((t) => (
              <button
                key={t.key || 'auto'}
                type="button"
                onClick={() => setTheme(t.key)}
                aria-pressed={theme === t.key}
                data-theme={t.key || 'auto'}
                className={chipClass(theme === t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs text-slate-600" data-cutout-row>
            <span className="mr-0.5">Equipment</span>
            {[{ key: '', label: 'None' }, ...CUTOUTS].map((c) => (
              <button
                key={c.key || 'none'}
                type="button"
                onClick={() => setCutout(c.key)}
                aria-pressed={cutout === c.key}
                data-cutout={c.key || 'none'}
                className={chipClass(cutout === c.key)}
              >
                {c.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setStockOpen((o) => !o)}
              aria-pressed={cutout.startsWith('stock:')}
              data-cutout="stock"
              title="Real photos of equipment, shared by every client"
              className={chipClass(cutout.startsWith('stock:'))}
            >
              {cutout.startsWith('stock:') ? `Stock: ${stockPath(cutout).split('/').pop().replace(/^\d+-/, '')}` : 'Stock library…'}
            </button>
          </div>
          {stockOpen && <StockPicker value={cutout} onChange={setCutout} onClose={() => setStockOpen(false)} />}
          <p className="text-[11px] text-slate-500">
            The built-in equipment is drawn as a product shot (a furnace with the burner glowing behind its sight glass, a
            condenser with its fan grille and line set, and so on); the stock library holds real photos (a PNG with a transparent
            background looks best) that every client can use. The badge, hook, offer, subhead and proof above all go on the template too; the proof
            paints as five gold stars.
          </p>
        </div>
      )}


      <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
        <span className="text-xs font-medium text-slate-600">9:16 safe area</span>
        <div className="flex gap-1">
          {SAFE_MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setSafeMode(m.key)}
              title={m.hint}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                safeMode === m.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {/* The plate, split and AI looks already put the words on a panel, so
            the switch would be a lie there; it says so instead of doing nothing. */}
        {['plate', 'split', 'ai'].includes(layout) || isTemplate(layout) ? (
          <span className="text-xs text-slate-400" data-hook-plate title="On this look the words already sit on a solid panel">
            Panel: built into this look
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-1 text-xs text-slate-600" data-hook-plate>
            <span className="mr-0.5">Panel</span>
            {[
              ['none', 'None', 'No panel; the scrim or haze does the work'],
              ['hook', 'Behind hook + subhead', layout === 'stack' ? 'A white card behind the big word, the headline and the subhead' : 'A plate behind the headline and the subhead'],
              ['subhead', 'Behind subhead only', 'A smaller card behind the subhead alone, when the headline reads fine and the small line does not'],
            ].map(([key, label, hint]) => (
              <button
                key={key}
                type="button"
                onClick={() => choosePanel(key)}
                title={hint}
                aria-pressed={panel === key}
                data-panel={key}
                className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                  panel === key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={guides}
            onChange={(e) => setGuides(e.target.checked)}
            className="rounded"
          />
          Show what Meta covers
        </label>
        <p className="text-[11px] text-slate-500 basis-full">
          Reels covers the bottom 35% of a 9:16 and Stories 20%, so Reels-safe fits both.
          The guides are preview only and never end up in a saved PNG.
        </p>
      </div>

      <CopyAssistant
        client={client}
        current={slots}
        onApply={applySuggestion}
        undoable={undoSlot}
        onUndo={() => {
          SLOT_SETTERS[undoSlot.field]?.(undoSlot.previous)
          setUndoSlot(null)
        }}
      />

      </div>

      {/* THE CANVAS. Dark, like every design tool, so the artboards read as
          the thing being made rather than as three more boxes on a form.
          Sticky on a wide screen: the words are typed on the left and land
          on the right without scrolling. */}
      <div className="space-y-3 rounded-2xl bg-slate-900 p-4 shadow-lg ring-1 ring-white/10 xl:sticky xl:top-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-300">Artboards</p>
        <p className="text-[11px] text-slate-400">hover to zoom · click to pin · drag the photo to place it</p>
      </div>
      <div className="flex flex-wrap justify-center gap-4 xl:justify-start">
        {SIZES.map((size, i) => (
          <div key={size.key} className="flex-shrink-0">
            <Artboard
              size={size}
              canvasRef={(el) => (refs.current[i] = el)}
              onZoom={() => !zoomPinned && setZoom(i)}
              onUnzoom={() => !zoomPinned && setZoom(null)}
              onPin={() => {
                setZoom(i)
                setZoomPinned(true)
              }}
              draggable={layout === 'card' || (FOCUS_LAYOUTS.includes(layout) && Boolean(assets.background))}
              onDragPhoto={(dx, dy) =>
                layout === 'card'
                  ? setPhoto((p) => dragPhoto(p, dx, dy, size.h, bands.current[i]))
                  : setFocus((f) => dragFocus(f, dx, dy, size.w, size.h, assets.background))
              }
            />
            <button
              onClick={() => download(i)}
              className="mt-1 text-[11px] text-sky-300 hover:text-sky-200 underline"
            >
              Save PNG
            </button>
          </div>
        ))}
      </div>

      {overlapLines.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900" data-overlap-warning>
          <p className="font-semibold">Something would be cut off. Not saved until it is fixed.</p>
          {overlapLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <label className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-800">
            <input type="checkbox" checked={saveAnyway} onChange={(e) => setSaveAnyway(e.target.checked)} className="rounded" data-save-anyway />
            I have looked and it is fine; let me save anyway
          </label>
        </div>
      )}

      {zoom !== null && refs.current[zoom] && (
        <ZoomedArtboard
          source={refs.current[zoom]}
          size={SIZES[zoom]}
          pinned={zoomPinned}
          onClose={() => {
            setZoomPinned(false)
            setZoom(null)
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3">
        {/* SEASON LABEL. Saved with the ad so it is findable next year. */}
        <label className="flex items-center gap-1.5 text-xs text-slate-300" title="Spring, summer, fall, winter, holiday or year-round. Leave on Auto and the Studio reads it off the copy and the date.">
          Season
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-xs text-white"
            aria-label="Season label"
          >
            <option value="">Auto ({AD_SEASONS.find((x) => x.key === seasonGuess().season)?.label || 'Year-round'})</option>
            {AD_SEASONS.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={editing ? saveOver : saveAll}
          disabled={saving || blocked}
          title={blocked ? 'Something overlaps or runs past the edge (see the warning above the buttons). Fix it, or tick "save anyway".' : editing ? 'Writes these artboards over the saved ad you opened. Nothing is duplicated.' : undefined}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          data-save-button
        >
          {saving ? 'Saving...' : blocked ? 'Fix the overlap to save' : editing ? 'Save changes' : 'Save all 3 sizes'}
        </button>
        {editing && (
          <>
            <button
              onClick={saveAll}
              disabled={saving}
              title="Keeps the original and saves this as a separate ad"
              className="text-[11px] text-slate-300 underline hover:text-white"
            >
              Save as a new ad instead
            </button>
            <button
              onClick={() => setEditing(null)}
              className="text-[11px] text-slate-400 hover:text-white"
              title="Keep what is on the artboards but stop pointing at the saved ad. The next save makes a new ad."
            >
              Stop editing
            </button>
          </>
        )}
        <button
          onClick={downloadAll}
          disabled={zipping}
          title="All three PNGs as one zip"
          className="px-4 py-2 bg-white border border-slate-300 text-slate-800 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition"
        >
          {zipping ? 'Zipping…' : 'Download all 3'}
        </button>
        <p className="text-[11px] text-slate-400">
          Saved to the public bucket, which is where Meta pulls the image bytes from. Download
          keeps them off the bucket entirely.
        </p>
      </div>
      </div>
      </div>
    </div>
  )
}
