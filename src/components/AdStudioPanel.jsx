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
import { recipeToContent, saveAdRecipe } from '../lib/savedAds'
import AdImagePicker from './AdImagePicker'
import { resolveImageSrc } from '../lib/driveAssets'
import { adFileName, saveBlob, zipAdSizes, zipFileName } from '../lib/adZip'
import {
  DEFAULT_ACCENT,
  DEFAULT_BADGE,
  brandColours,
  SAFE_MODES,
  SIZES,
  canvasToBlob,
  ensureFonts,
  loadImage,
  renderAd,
} from '../lib/adCanvas'

const IMAGE_RE = /\.(png|jpe?g|webp)$/i

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

function Artboard({ size, canvasRef, onZoom, onUnzoom, onPin }) {
  return (
    <div className="flex-shrink-0">
      <canvas
        ref={canvasRef}
        onMouseEnter={onZoom}
        onMouseLeave={onUnzoom}
        onClick={onPin}
        // Deliberately no title attribute: a native tooltip paints above every
        // layer on the page, including the zoom overlay this hover just opened,
        // so it lands in the middle of the enlarged ad. The overlay captions
        // itself instead.
        className="border border-slate-300 rounded bg-slate-100 cursor-zoom-in transition hover:border-orange-400 hover:ring-2 hover:ring-orange-200"
        style={{ width: size.w / 5, height: size.h / 5 }}
      />
      <p className="text-[11px] text-slate-500 mt-1">
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

function Tabs({ tab, setTab }) {
  return (
    <div className="flex gap-1 border-b border-slate-200 -mt-1">
      {[
        // First, because looking at what already works is where an ad starts.
        ['research', 'Research'],
        ['design', 'Design'],
        ['saved', 'Saved ads'],
        // Before Publish on purpose: the form has to exist first in practice,
        // because a GoHighLevel workflow is wired to its id and that is step
        // one, not an afterthought once the ad is built.
        ['form', 'Lead form'],
        ['publish', 'Publish'],
      ].map(([key, label]) => (
        <button
          key={key}
          onClick={() => setTab(key)}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            tab === key
              ? 'border-orange-600 text-orange-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {label}
        </button>
      ))}
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
function SeedBanner({ seed }) {
  return (
    <details className="rounded-lg border border-orange-200 bg-orange-50 p-3">
      <summary className="cursor-pointer text-sm font-medium text-orange-900">
        From chat: {seed.hookAngle || 'creative set'}
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

// The proof strip is a fact about the client, not something to retype per ad.
function proofFromIntake(intake) {
  const rating = intake?.reviews_star_rating
  if (!rating) return ''
  const count = Number(String(intake.reviews_count || '').replace(/\D/g, ''))
  return count ? `\u2605 ${rating} on Google \u00b7 ${count} reviews` : `\u2605 ${rating} on Google`
}

export default function AdStudioPanel({ client, intake, seed }) {
  const [files, setFiles] = useState([])
  // Mirrors clients.drive_folder_id so linking a folder updates the pickers
  // without a page reload.
  const [driveFolderId, setDriveFolderId] = useState(client.drive_folder_id || '')
  const [backgroundPath, setBackgroundPath] = useState('')
  const [logoPath, setLogoPath] = useState('')
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

  // Meta's interface covers the top and bottom of a 9:16. Reels is the
  // strictest of the placements, so it is the default: a CTA hidden behind the
  // caption row is worse than one sitting higher up the frame.
  const [safeMode, setSafeMode] = useState('reels')
  const [guides, setGuides] = useState(false)
  const [swatches, setSwatches] = useState([])
  // Set once the colours came from the logo, so a later logo change can replace
  // them without stamping over a colour picked by hand.
  const [fromLogo, setFromLogo] = useState(false)
  const [tab, setTab] = useState('design')
  // Bumped after a save so the gallery refetches instead of showing a stale list.
  const [savedAt, setSavedAt] = useState(0)
  // The saved set the Publish tab is working on, picked from the gallery.
  const [publishing, setPublishing] = useState(null)
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
  const [zipping, setZipping] = useState(false)

  const refs = useRef(SIZES.map(() => null))
  const intakeProof = useMemo(() => proofFromIntake(intake), [intake])

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
  useEffect(() => {
    if (!intake || seed) return
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
  }, [intake, seed])

  // Copy handed over from the chat, already mapped onto the slots.
  useEffect(() => {
    if (!seed) return
    setHook(seed.hook || '')
    setOfferAmount(seed.offerAmount || '')
    setOfferDetail(seed.offerDetail || '')
    setSubhead(seed.subhead || '')
    setProof(seed.proof || '')
    setPrimaryText(seed.primaryText || '')
    setMetaHeadline(seed.headline || '')
    setMetaDescription(seed.description || '')
    // Neither the location nor the star rating belongs to a creative set, so
    // the intake stays the source for those unless the brief overrode them.
    if (seed.badge) setBadge(seed.badge)
    setProof(seed.proof || intakeProof)
    // Only when the set actually named a colour. Anything else leaves the
    // studio default, or a colour already pulled off the logo, alone.
    if (seed.accent) {
      setAccent(seed.accent)
      setFromLogo(false)
    }
    if (seed.badgeColor) {
      setBadgeColor(seed.badgeColor)
      setFromLogo(false)
    }
  }, [seed, intakeProof])

  useEffect(() => {
    supabase
      .from('client_files')
      .select('id, file_name, storage_path')
      .eq('client_id', client.id)
      .then(({ data }) => setFiles((data || []).filter((f) => IMAGE_RE.test(f.storage_path))))
  }, [client.id])

  // What has already gone to Meta, so the Publish tab can warn before creating
  // a second copy of the same ad. A missing published_ads table means the
  // migration has not been run yet, which is not worth failing the Studio over.
  useEffect(() => {
    fetchPublishedAds(client.id)
      .then(setPublished)
      .catch(() => setPublished([]))
  }, [client.id])

  // Reload the bitmaps whenever a pick changes.
  useEffect(() => {
    let cancelled = false
    // A pick is either a storage path or `drive:<fileId>`, so the URL has to be
    // resolved before the bitmap can load. Drive resolves to a blob: URL, which
    // is same-origin and so cannot taint the canvas that toBlob() has to read.
    const bitmap = async (path) => (path ? loadImage(await resolveImageSrc(client.id, path)) : null)

    Promise.all([bitmap(backgroundPath), bitmap(logoPath)])
      .then(([background, logo]) => {
        if (cancelled) return
        setAssets({ background, logo })
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
        if (untouched) {
          setAccent(palette.accent)
          setBadgeColor(palette.badge)
          setFromLogo(true)
        }
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [backgroundPath, logoPath, client.id])

  // Repaint every artboard on any change. Fonts must be ready first or the
  // first paint measures with a fallback face and wraps differently.
  useEffect(() => {
    let cancelled = false
    const content = { badge, hook, offerAmount, offerDetail, subhead, proof, accent, badgeColor, hookPlate }
    ensureFonts().then(() => {
      if (cancelled) return
      SIZES.forEach((size, i) => {
        const canvas = refs.current[i]
        if (canvas) renderAd(canvas, size, content, assets, { safeMode, guides })
      })
    })
    return () => {
      cancelled = true
    }
  }, [badge, hook, offerAmount, offerDetail, subhead, proof, accent, badgeColor, hookPlate, assets, safeMode, guides])

  // Guides are a preview aid. Repaint clean, export, then put them back, so a
  // saved PNG can never carry the red bands into the ad account.
  const withoutGuides = (fn) => async (...args) => {
    const content = { badge, hook, offerAmount, offerDetail, subhead, proof, accent, badgeColor, hookPlate }
    const repaint = (g) =>
      SIZES.forEach((size, i) => {
        const c = refs.current[i]
        if (c) renderAd(c, size, content, assets, { safeMode, guides: g })
      })
    if (guides) repaint(false)
    try {
      return await fn(...args)
    } finally {
      if (guides) repaint(true)
    }
  }

  /**
   * Reopens a saved ad for editing.
   *
   * Saving afterwards writes a NEW set rather than replacing the old one. The
   * old images keep their public URLs, and those URLs may already be attached
   * to a live Meta ad; overwriting them would change a running ad's creative
   * with no way to tell it happened.
   */
  const editSaved = (row) => {
    const r = recipeToContent(row)
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
    // Colours came from the saved ad, so a logo reload must not replace them.
    setFromLogo(false)
    setBackgroundPath(r.backgroundPath)
    setLogoPath(r.logoPath)
    setSafeMode(r.safeMode)
    setSaved('')
    setError('')
    setTab('design')
  }

  const upload = async (file, setPath) => {
    setError('')
    try {
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
          content: {
            badge,
            hook,
            offerAmount,
            offerDetail,
            subhead,
            proof,
            accent,
            badgeColor,
            hookPlate,
            primaryText,
            headline: metaHeadline,
            description: metaDescription,
          },
          backgroundPath,
          logoPath,
          safeMode,
        })
      } catch (recipeErr) {
        console.warn('Ad saved but its recipe was not stored:', recipeErr.message)
      }
      setSaved(`Saved ${urls.length} sizes. Find them any time on the Saved ads tab.`)
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
  const startPublish = (set) => {
    setPublishing(set)
    setTab('publish')
  }

  if (tab === 'saved') {
    return (
      <div className="space-y-4">
        <Tabs tab={tab} setTab={setTab} />
        <SavedAdsGallery
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
    return (
      <div className="space-y-3">
        <Tabs tab={tab} setTab={setTab} />
        <ResearchPanel client={client} intake={intake} />
      </div>
    )
  }

  if (tab === 'form') {
    return (
      <div className="space-y-3">
        <Tabs tab={tab} setTab={setTab} />
        <LeadFormStudio client={client} />
      </div>
    )
  }

  if (tab === 'publish') {
    return (
      <div className="space-y-4">
        <Tabs tab={tab} setTab={setTab} />
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
            <Button variant="outline" size="md" onClick={() => setPublishing('blank')}>
              🎬 Publish a video
            </Button>
            <SavedAdsGallery
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

  return (
    <div className="space-y-4">
      <Tabs tab={tab} setTab={setTab} />
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

      <div className="grid md:grid-cols-2 gap-3">
        <AdImagePicker
          label="Background photo"
          client={client}
          files={files}
          value={backgroundPath}
          onChange={setBackgroundPath}
          onUpload={(f) => upload(f, setBackgroundPath)}
          driveFolderId={driveFolderId}
          onFolderSaved={setDriveFolderId}
        />
        <AdImagePicker
          label="Logo"
          client={client}
          files={files}
          value={logoPath}
          onChange={setLogoPath}
          onUpload={(f) => upload(f, setLogoPath)}
          driveFolderId={driveFolderId}
          onFolderSaved={setDriveFolderId}
        />
      </div>

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
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={hookPlate}
            onChange={(e) => setHookPlate(e.target.checked)}
            className="rounded"
          />
          Panel behind the hook
        </label>
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

      <div className="flex gap-4 overflow-x-auto pb-2 pt-1">
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
            />
            <button
              onClick={() => download(i)}
              className="mt-1 text-[11px] text-blue-600 hover:text-blue-800 underline"
            >
              Save PNG
            </button>
          </div>
        ))}
      </div>

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

      <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
        <button
          onClick={saveAll}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {saving ? 'Saving...' : 'Save all 3 sizes'}
        </button>
        <button
          onClick={downloadAll}
          disabled={zipping}
          title="All three PNGs as one zip"
          className="px-4 py-2 bg-white border border-slate-300 text-slate-800 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition"
        >
          {zipping ? 'Zipping…' : 'Download all 3'}
        </button>
        <p className="text-[11px] text-slate-500">
          Saved to the public bucket, which is where Meta pulls the image bytes from. Download
          keeps them off the bucket entirely.
        </p>
      </div>
    </div>
  )
}
