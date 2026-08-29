import { cn } from './cn'

/**
 * One number and what it means.
 *
 * The reports and the scan report each had their own. `tabular-nums` is the
 * point of having a shared one: without it a column of figures jitters as the
 * digits change width, which is exactly what a client notices on a report.
 */
export default function Stat({ label, value, sub, tone = 'default', className }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-xl font-semibold tabular-nums',
          tone === 'success' ? 'text-green-700' : tone === 'danger' ? 'text-red-700' : 'text-slate-900'
        )}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-slate-500 truncate">{sub}</p>}
    </div>
  )
}
