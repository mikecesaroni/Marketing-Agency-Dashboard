import { cn } from '../ui/cn'
import { CHANNELS } from '../../lib/channels'

/**
 * The pieces the dark report pages are made of. Plain Tailwind, dark only:
 * these live on the report pages, which set Layout to its dark tone.
 */

/** A panel on the dark report surface, with an optional channel accent along the top. */
export function Panel({ channel, className, children, as: As = 'div', ...rest }) {
  const c = channel ? CHANNELS[channel] : null
  return (
    <As
      className={cn(
        'relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0f1626] shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_12px_32px_-16px_rgba(0,0,0,0.6)]',
        className
      )}
      {...rest}
    >
      {c && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${c.color}, transparent)` }}
        />
      )}
      {c && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 left-1/2 h-32 w-2/3 -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: c.soft }}
        />
      )}
      <div className="relative">{children}</div>
    </As>
  )
}

/** Small uppercase label, the way every heading on these pages is set. */
export function Eyebrow({ children, className }) {
  return <p className={cn('text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500', className)}>{children}</p>
}

/** A section heading with an optional channel dot and a right-hand slot. */
export function SectionTitle({ channel, title, sub, right }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div className="flex items-center gap-2.5">
        {channel && <ChannelDot channel={channel} size="md" />}
        <div>
          <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>
          {sub && <p className="text-xs text-slate-500">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

export function ChannelDot({ channel, size = 'sm' }) {
  const c = CHANNELS[channel]
  if (!c) return null
  const s = size === 'md' ? 'h-2.5 w-2.5' : 'h-2 w-2'
  return <span className={cn('inline-block flex-shrink-0 rounded-full', s)} style={{ background: c.color, boxShadow: `0 0 0 3px ${c.ring}` }} />
}

/**
 * A 12-to-90 point line of one measure, in the channel colour, with the last
 * point marked. No axis: it shows shape, the tile shows the number.
 */
export function Sparkline({ values, channel, height = 32 }) {
  const c = CHANNELS[channel] || CHANNELS.meta
  const pts = (values || []).map((v) => Number(v || 0))
  if (pts.length < 2 || pts.every((v) => v === 0)) {
    return <div style={{ height }} className="flex items-end"><span className="h-px w-full bg-white/10" /></div>
  }
  const w = 120
  const max = Math.max(...pts, 0) || 1
  const step = w / (pts.length - 1)
  const y = (v) => height - 3 - (v / max) * (height - 6)
  const line = pts.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `M0,${height} L${line.split(' ').join(' L')} L${w},${height}Z`
  const id = `spark-${channel}-${pts.length}`
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={c.color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={c.color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={c.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/**
 * Value, how it moved against the previous window, and a sparkline.
 * Direction is not the same as good (cost per lead falling is a win), so the
 * caller says which way is better and the delta colour follows that.
 */
export function KpiTile({ label, value, delta, lowerIsBetter = false, spark, channel, sub, hero = false }) {
  const has = delta != null && Number.isFinite(delta)
  const up = has && delta > 0
  const flat = has && Math.abs(delta) < 0.5
  const good = flat ? null : lowerIsBetter ? !up : up
  return (
    <Panel channel={hero ? channel : undefined} className="p-4">
      <div className="flex items-center gap-2">
        {channel && !hero && <ChannelDot channel={channel} />}
        <Eyebrow>{label}</Eyebrow>
      </div>
      <p className={cn('mt-2 font-semibold tracking-tight text-white', hero ? 'text-5xl' : 'text-2xl')}>{value}</p>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
        {has ? (
          <>
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 font-semibold tabular-nums',
                good === null ? 'bg-white/5 text-slate-400' : good ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'
              )}
            >
              {flat ? '±' : up ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%
            </span>
            <span className="text-slate-500">vs previous period</span>
          </>
        ) : (
          <span className="text-slate-500">{sub || 'No earlier period to compare'}</span>
        )}
      </div>
      {spark && (
        <div className="mt-3">
          <Sparkline values={spark} channel={channel || 'meta'} />
        </div>
      )}
    </Panel>
  )
}

/**
 * One horizontal bar split by channel, with a legend under it that carries
 * the numbers. Identity is never colour alone: every segment has a labelled
 * swatch beside its value.
 */
export function MixBar({ mix, format }) {
  if (!mix.length) return <div className="h-2.5 rounded-full bg-white/5" />
  return (
    <div>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-white/5">
        {mix.map((m) => (
          <span key={m.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${m.share}%`, background: CHANNELS[m.key].color }} title={`${CHANNELS[m.key].long}: ${format(m.value)} (${Math.round(m.share)}%)`} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
        {mix.map((m) => (
          <span key={m.key} className="flex items-center gap-1.5 text-xs text-slate-400">
            <ChannelDot channel={m.key} />
            <span className="text-slate-300">{CHANNELS[m.key].long}</span>
            <span className="tabular-nums text-white">{format(m.value)}</span>
            <span className="tabular-nums text-slate-500">{Math.round(m.share)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Segmented control for the dark header: ranges, scopes, metrics. */
export function Segmented({ options, value, onChange, size = 'md' }) {
  return (
    <div className="flex min-w-0 flex-shrink-0 rounded-xl border border-white/10 bg-white/[0.03] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'whitespace-nowrap rounded-[10px] font-medium transition',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            value === o.value ? 'bg-white text-slate-900 shadow' : 'text-slate-400 hover:text-white'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function DarkButton({ className, children, ...rest }) {
  return (
    <button
      type="button"
      className={cn(
        'whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Tables on the dark surface. */
export function DTable({ children }) {
  return (
    <Panel>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    </Panel>
  )
}

export function DTh({ numeric, className, children }) {
  return (
    <th className={cn('border-b border-white/[0.07] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500', numeric ? 'text-right' : 'text-left', className)}>
      {children}
    </th>
  )
}

export function DTr({ className, children, ...rest }) {
  return (
    <tr className={cn('border-b border-white/[0.05] transition last:border-b-0 hover:bg-white/[0.03]', className)} {...rest}>
      {children}
    </tr>
  )
}

export function DTd({ numeric, muted, className, children, ...rest }) {
  return (
    <td className={cn('px-4 py-2.5', numeric && 'text-right tabular-nums', muted ? 'text-slate-400' : 'text-slate-200', className)} {...rest}>
      {children}
    </td>
  )
}

/** A status pill for the dark surface. */
export function Pill({ tone = 'neutral', children, title }) {
  const tones = {
    success: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/20',
    warning: 'bg-amber-400/10 text-amber-300 ring-amber-400/20',
    info: 'bg-sky-400/10 text-sky-300 ring-sky-400/20',
    danger: 'bg-rose-400/10 text-rose-300 ring-rose-400/20',
    neutral: 'bg-white/5 text-slate-400 ring-white/10',
  }
  return (
    <span title={title} className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', tones[tone] || tones.neutral)}>
      {children}
    </span>
  )
}
