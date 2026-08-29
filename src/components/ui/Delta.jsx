import { cn } from './cn'
import { IconTrendUp, IconTrendDown } from './icons'

/**
 * Week-on-week change, coloured by whether the direction is good.
 *
 * Which direction is good is not a property of the number, it is a property of
 * the metric: more leads is good, a higher cost per lead is bad, and more ad
 * spend is neither on its own. So the caller says, with `goodWhen`, and a
 * metric that is merely informational passes nothing and gets grey.
 *
 * A rise from nothing is not a percentage. Going from 0 leads to 6 is not "up
 * 600%" or "up Infinity%", it is new, and saying so is both true and more
 * useful than a number that has to be explained.
 */
export default function Delta({ current, previous, goodWhen, format, className }) {
  const has = Number.isFinite(current) && Number.isFinite(previous)
  if (!has) return null

  if (previous === 0) {
    if (current === 0) return null
    return (
      <span className={cn('text-[11px] font-medium text-slate-500', className)}>
        new this week
      </span>
    )
  }

  const change = (current - previous) / Math.abs(previous)
  // Under half a percent is noise, and an arrow on noise makes every week look
  // like something happened.
  if (Math.abs(change) < 0.005) {
    return <span className={cn('text-[11px] text-slate-400', className)}>no change</span>
  }

  const up = change > 0
  const good = goodWhen === 'up' ? up : goodWhen === 'down' ? !up : null
  const Arrow = up ? IconTrendUp : IconTrendDown

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-medium tabular-nums',
        good === null ? 'text-slate-500' : good ? 'text-green-600' : 'text-red-600',
        className
      )}
    >
      <Arrow className="h-3.5 w-3.5" />
      {Math.abs(change * 100).toFixed(0)}%
      {format ? ` (${format(previous)} last wk)` : ''}
    </span>
  )
}
