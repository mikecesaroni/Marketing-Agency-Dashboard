import { useState } from 'react'
import { TONES } from '../../../supabase/functions/_shared/scriptStudio.js'

const box = 'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-[17px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400'

/**
 * "How I talk": a short sheet the owner fills in once so every script
 * sounds like them. Nothing here is required; the scripts are written
 * without it and get better with it.
 */
export default function VoiceSheet({ voice, saving, onSave, onClose }) {
  const [v, setV] = useState({
    goes_by: voice?.goes_by || '',
    person: voice?.person || '',
    tone: voice?.tone || '',
    avoid: voice?.avoid || '',
    sign_off: voice?.sign_off || '',
    notes: voice?.notes || '',
  })
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }))
  const chip = (on) => `rounded-full border px-4 py-2.5 text-[15px] font-semibold transition ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-voice-sheet>
      <h2 className="text-2xl font-bold tracking-tight">How I talk</h2>
      <p className="mt-1 text-[15px] text-slate-600">A minute here and every script sounds like you. Skip anything; it all works without it.</p>
      <div className="mt-4 space-y-4">
        <label className="block text-[15px] font-semibold text-slate-800">
          What people call you
          <input type="text" value={v.goes_by} onChange={set('goes_by')} placeholder="Ethan" className={box} data-voice-goes-by />
        </label>
        <div>
          <p className="text-[15px] font-semibold text-slate-800">On camera I say</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {[
              ['i', '"I" (it is me)'],
              ['we', '"We" (the company)'],
              ['', 'Either, whatever fits'],
            ].map(([key, label]) => (
              <button key={key || 'any'} type="button" onClick={() => setV((x) => ({ ...x, person: key }))} className={chip(v.person === key)} aria-pressed={v.person === key}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[15px] font-semibold text-slate-800">My style</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button key={t.key} type="button" onClick={() => setV((x) => ({ ...x, tone: x.tone === t.key ? '' : t.key }))} className={chip(v.tone === t.key)} aria-pressed={v.tone === t.key}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-[15px] font-semibold text-slate-800">
          Words I never say
          <input type="text" value={v.avoid} onChange={set('avoid')} placeholder="cheap, deal, folks" className={box} />
        </label>
        <label className="block text-[15px] font-semibold text-slate-800">
          How I sign off
          <input type="text" value={v.sign_off} onChange={set('sign_off')} placeholder="Stay warm out there." className={box} />
        </label>
        <label className="block text-[15px] font-semibold text-slate-800">
          Anything else about how you talk
          <textarea value={v.notes} onChange={set('notes')} rows={3} placeholder="I always mention my dad started the company. I never badmouth other companies." className={box} />
        </label>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={() => onSave(v)} disabled={saving} className="rounded-xl bg-orange-600 px-6 py-3.5 text-[17px] font-bold text-white hover:bg-orange-700 disabled:opacity-50" data-voice-save>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-[17px] font-semibold text-slate-800 hover:bg-slate-50">
          Back
        </button>
      </div>
    </section>
  )
}
