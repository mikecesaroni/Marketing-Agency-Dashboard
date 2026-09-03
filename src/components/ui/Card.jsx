import { cn } from './cn'

/**
 * The white box almost every screen is built out of.
 *
 * `border border-slate-200` appears 70 times across the app and `bg-white`
 * with a rounded corner and a shadow nearly as often, in four or five slightly
 * different combinations. One box, one set of corners.
 *
 * `tone` is for the boxes that carry a state rather than content -- the red
 * error strip, the green success panel, the amber warning -- which were being
 * hand-built each time out of a 50-shade background and a 200-shade border.
 */

const TONES = {
  default: 'bg-white border-slate-200/80',
  muted: 'bg-slate-50 border-slate-200/80',
  info: 'bg-blue-50 border-blue-200',
  success: 'bg-green-50 border-green-200',
  warning: 'bg-amber-50 border-amber-200',
  danger: 'bg-red-50 border-red-200',
}

const PADDING = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' }

export default function Card({
  tone = 'default',
  padding = 'md',
  className,
  children,
  // A card that is really a control renders as one. `as="button"` rather than
  // a click handler on a div, so it is reachable by keyboard and announced as
  // a button without any of that being reimplemented here.
  as: Element = 'div',
  ...rest
}) {
  return (
    <Element
      className={cn(
        // The shadow is deliberately almost nothing: one pixel, four percent
        // black. Enough to lift a white card off a near-white page, not enough
        // to read as a drop shadow. Anything heavier and a screen full of
        // cards turns into a screen full of shadows.
        'rounded-xl border shadow-[0_1px_2px_0_rgb(15_23_42_/_0.04)]',
        TONES[tone] || TONES.default,
        PADDING[padding] ?? PADDING.md,
        className
      )}
      {...rest}
    >
      {children}
    </Element>
  )
}

/**
 * A card's heading row. Kept separate so a card with no heading does not carry
 * an empty one, and so the title, the subtitle and the actions on the right
 * line up the same way on every screen.
 */
export function CardHeader({ title, subtitle, actions, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold tracking-tight text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
