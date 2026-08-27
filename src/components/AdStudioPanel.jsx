import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { copyText } from '../lib/intakeSummary'
import { splitOffer } from '../lib/clientChat'
import { extractPalette } from '../lib/logoColours'
import SavedAdsGallery from './SavedAdsGallery'
import PublishToMetaPanel from './PublishToMetaPanel'
import { fetchPublishedAds } from '../lib/metaPublish'
import { recipeToContent, saveAdRecipe } from '../lib/savedAds'
import {
  DEFAULT_ACCENT,
  DEFAULT_BADGE,
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

function Artboard({ size, canvasRef }) {
  return (
    <div className="flex-shrink-0">
      <canvas
        ref={canvasRef}
        className="border border-slate-300 rounded bg-slate-100"
        style={{ width: size.w / 5, height: size.h / 5 }}
      />
      <p className="text-[11px] text-slate-500 mt-1">
        {size.label} {size.w}&times;{size.h}
      </p>
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
        ['design', 'Design'],
        ['saved', 'Saved ads'],
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
  const [backgroundPath, setBackgroundPath] = useState('')
  const [logoPath, setLogoPath] = useState('')
  const [accent, setAccent] = useState(DEFAULT_ACCENT)
  const [badgeColor, setBadgeColor] = useState(DEFAULT_BADGE)

  const [badge, setBadge] = useState('')
  const [hook, setHook] = useState('')
  const [offerAmount, setOfferAmount] = useState('')
  const [offerDetail, setOfferDetail] = useState('')
  const [subhead, setSubhead] = useState('')
  const [proof, setProof] = useState('')
  const [cta, setCta] = useState('Book Today!')

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

  const [assets, setAssets] = useState({ background: null, logo: null })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')

  const refs = useRef(SIZES.map(() => null))
  const intakeProof = useMemo(() => proofFromIntake(intake), [intake])

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
    setCta(seed.cta || 'Book Today!')
    setPrimaryText(seed.primaryText || '')
    setMetaHeadline(seed.headline || '')
    setMetaDescription(seed.description || '')
    // Neither the location nor the star rating belongs to a creative set, so
    // the intake stays the source for those unless the brief overrode them.
    if (seed.badge) setBadge(seed.badge)
    setProof(seed.proof || intakeProof)
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
    Promise.all([
      backgroundPath ? loadImage(publicUrl(backgroundPath)) : null,
      logoPath ? loadImage(publicUrl(logoPath)) : null,
    ])
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
        // previous logo. A colour the user chose is theirs to keep.
        const untouched =
          fromLogo || (accent === DEFAULT_ACCENT && badgeColor === DEFAULT_BADGE)
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
  }, [backgroundPath, logoPath])

  // Repaint every artboard on any change. Fonts must be ready first or the
  // first paint measures with a fallback face and wraps differently.
  useEffect(() => {
    let cancelled = false
    const content = { badge, hook, offerAmount, offerDetail, subhead, proof, cta, accent, badgeColor, hookPlate }
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
  }, [badge, hook, offerAmount, offerDetail, subhead, proof, cta, accent, badgeColor, hookPlate, assets, safeMode, guides])

  // Guides are a preview aid. Repaint clean, export, then put them back, so a
  // saved PNG can never carry the red bands into the ad account.
  const withoutGuides = (fn) => async (...args) => {
    const content = { badge, hook, offerAmount, offerDetail, subhead, proof, cta, accent, badgeColor, hookPlate }
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
    setCta(r.cta)
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
            cta,
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
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${client.name.replace(/\W+/g, '-').toLowerCase()}-${SIZES[i].key}.png`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    }
  })

  const Picker = ({ label, value, onChange, onUpload }) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-xs"
        >
          <option value="">None</option>
          {files.map((f) => (
            <option key={f.storage_path} value={f.storage_path}>
              {f.file_name}
            </option>
          ))}
        </select>
        <label className="px-2 py-1.5 bg-slate-100 border border-slate-300 rounded text-xs cursor-pointer hover:bg-slate-200 whitespace-nowrap">
          Upload
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
          />
        </label>
      </div>
    </div>
  )

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
              ← Pick a different ad
            </button>
            <PublishToMetaPanel
              client={client}
              set={publishing}
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
              Pick a saved ad to publish. It goes into {client.name}&rsquo;s Meta account paused —
              nothing spends until you switch it on in Ads Manager.
            </p>
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
        <Picker
          label="Background photo"
          value={backgroundPath}
          onChange={setBackgroundPath}
          onUpload={(f) => upload(f, setBackgroundPath)}
        />
        <Picker
          label="Logo"
          value={logoPath}
          onChange={setLogoPath}
          onUpload={(f) => upload(f, setLogoPath)}
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
        <Field label="3 · CTA pill" value={cta} onChange={setCta} hint="text on the white button" />
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

      <div className="flex gap-4 overflow-x-auto pb-2 pt-1">
        {SIZES.map((size, i) => (
          <div key={size.key} className="flex-shrink-0">
            <Artboard size={size} canvasRef={(el) => (refs.current[i] = el)} />
            <button
              onClick={() => download(i)}
              className="mt-1 text-[11px] text-blue-600 hover:text-blue-800 underline"
            >
              Save PNG
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
        <button
          onClick={saveAll}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {saving ? 'Saving...' : 'Save all 3 sizes'}
        </button>
        <p className="text-[11px] text-slate-500">
          Saved to the public bucket, which is where Meta pulls the image bytes from.
        </p>
      </div>
    </div>
  )
}
