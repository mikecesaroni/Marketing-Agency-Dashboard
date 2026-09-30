import { useSearchParams } from 'react-router-dom'
import { CHANNELS } from '../../lib/channels'

const OPTIONS = [
  { value: 'meta', label: 'Meta', color: CHANNELS.meta.color },
  { value: 'google', label: 'Google Ads', color: CHANNELS.google.color },
]

/**
 * The Meta / Google Ads switch at the top of a client's ad page. Swaps the
 * channel in the address and keeps everything else (range, scope), so the
 * same 30 days carry across. Replaces rather than pushes, so the back
 * button still goes to wherever the page was opened from.
 */
export default function ChannelSwitch({ value }) {
  const [params, setParams] = useSearchParams()
  const pick = (channel) => {
    if (channel === value) return
    const next = new URLSearchParams(params)
    next.set('channel', channel)
    setParams(next, { replace: true })
  }
  return (
    <div role="tablist" aria-label="Channel" className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-0.5">
      {OPTIONS.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => pick(o.value)}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-[10px] px-3.5 py-1.5 text-sm font-medium transition ${
              on ? 'bg-white text-slate-900 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: o.color }} />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
