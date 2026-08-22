import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  DEFAULT_ACCENT,
  SIZES,
  canvasToBlob,
  loadImage,
  renderAd,
} from '../lib/adCanvas'

const IMAGE_RE = /\.(png|jpe?g|webp)$/i

function publicUrl(path) {
  return supabase.storage.from('client-files').getPublicUrl(path).data.publicUrl
}

function Artboard({ size, content, assets, canvasRef }) {
  return (
    <div className="flex-shrink-0">
      <p className="text-[11px] font-medium text-slate-500 mb-1">{size.label}</p>
      <canvas
        ref={canvasRef}
        className="border border-slate-300 rounded bg-slate-100"
        style={{ width: size.w / 5, height: size.h / 5 }}
      />
    </div>
  )
}

export default function AdStudioPanel({ client, intake }) {
  const [files, setFiles] = useState([])
  const [backgroundPath, setBackgroundPath] = useState('')
  const [logoPath, setLogoPath] = useState('')
  const [accent, setAccent] = useState(DEFAULT_ACCENT)

  const [hook, setHook] = useState('')
  const [offer, setOffer] = useState('')
  const [cta, setCta] = useState('Get Quote')

  const [assets, setAssets] = useState({ background: null, logo: null })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')

  const refs = useRef(SIZES.map(() => null))

  // Prefill from intake so the first render is a real ad, not empty boxes.
  useEffect(() => {
    if (!intake) return
    const city = (intake.target_cities || intake.service_area || '').split(/[\n,]/)[0]?.trim()
    setHook(city ? `${city} homeowners: is your system ready?` : 'Is your system ready?')
    setOffer(
      (intake.current_offers_guarantees || intake.cta_offering || '')
        .split('\n')[0]
        ?.replace(/^[-•\s]+/, '') || ''
    )
  }, [intake])

  useEffect(() => {
    supabase
      .from('client_files')
      .select('id, file_name, storage_path')
      .eq('client_id', client.id)
      .then(({ data }) => setFiles((data || []).filter((f) => IMAGE_RE.test(f.storage_path))))
  }, [client.id])

  // Reload the bitmaps whenever a pick changes.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      backgroundPath ? loadImage(publicUrl(backgroundPath)) : null,
      logoPath ? loadImage(publicUrl(logoPath)) : null,
    ])
      .then(([background, logo]) => {
        if (!cancelled) {
          setAssets({ background, logo })
          setError('')
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
    document.fonts?.ready.then(() => {
      if (cancelled) return
      SIZES.forEach((size, i) => {
        const canvas = refs.current[i]
        if (canvas) renderAd(canvas, size, { hook, offer, cta, accent }, assets)
      })
    })
    return () => {
      cancelled = true
    }
  }, [hook, offer, cta, accent, assets])

  const upload = async (file, setPath) => {
    setError('')
    try {
      const path = `${client.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('client-files').upload(path, file)
      if (upErr) throw upErr
      await supabase.from('client_files').insert({
        client_id: client.id,
        file_name: file.name,
        file_type: file.type,
        storage_path: path,
      })
      setFiles((f) => [...f, { id: path, file_name: file.name, storage_path: path }])
      setPath(path)
    } catch (err) {
      setError(err.message)
    }
  }

  // Saves all three sizes back into the same public bucket. Public is exactly
  // what Meta's image uploader needs: it fetches the bytes with no auth.
  const saveAll = async () => {
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
        await supabase.from('client_files').insert({
          client_id: client.id,
          file_name: `ad-${stamp}-${SIZES[i].key}.png`,
          file_type: 'image/png',
          storage_path: path,
        })
        urls.push(publicUrl(path))
      }
      setSaved(`Saved ${urls.length} sizes. These URLs are what Meta uploads from.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

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

  return (
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
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Hook</label>
          <textarea
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
          />
        </div>
        <div className="grid md:grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Offer</label>
            <input
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">CTA</label>
              <input
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Colour</label>
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-[38px] w-12 border border-slate-300 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 pt-1">
        {SIZES.map((size, i) => (
          <Artboard
            key={size.key}
            size={size}
            content={{ hook, offer, cta, accent }}
            assets={assets}
            canvasRef={(el) => (refs.current[i] = el)}
          />
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
