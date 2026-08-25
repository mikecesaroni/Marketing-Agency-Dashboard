import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// "Live" vs "Not yet" for a single channel on a single client. Writes straight
// to the clients row so every screen reads the same flag.
export default function LiveToggle({
  clientId,
  field,
  label,
  value,
  onChange,
  size = 'md',
  // Ads go live; a profile gets optimized. Same switch, different verb.
  doneWord = 'live',
}) {
  const [saving, setSaving] = useState(false)
  const [live, setLive] = useState(!!value)

  const toggle = async () => {
    const next = !live
    setLive(next)
    setSaving(true)

    const { error } = await supabase.from('clients').update({ [field]: next }).eq('id', clientId)

    setSaving(false)
    if (error) {
      setLive(!next)
      return
    }
    onChange?.(next)
  }

  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1.5 text-sm'

  return (
    <button
      onClick={toggle}
      disabled={saving}
      title={`${label}: ${live ? doneWord : `not ${doneWord} yet`} — click to change`}
      className={`${pad} rounded-lg font-semibold transition disabled:opacity-60 ${
        live
          ? 'bg-green-100 text-green-800 hover:bg-green-200'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {live ? '● ' : '○ '}
      {label} {live ? doneWord : 'not yet'}
    </button>
  )
}
