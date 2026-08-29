import { cn } from './cn'

/**
 * The one button.
 *
 * There were 183 buttons in this app and 45 different class strings between
 * them, 36 of which appeared exactly once. Nobody chose that: it is what
 * happens when the thirty-seventh button gets written from memory. Two that
 * sat side by side differed only in that one had py-2 and no transition and
 * the other had py-2.5 and one -- invisible in the diff, visible on screen.
 *
 * Every value below is the one already most common in the codebase, so
 * migrating a call site changes what it is made of without changing how it
 * looks: rounded-lg (43 uses against 9 for rounded), py-2/py-1.5/py-2.5 as the
 * three real sizes, focus:ring-blue-400 (26 uses).
 */

const VARIANTS = {
  // The action the screen is for. One per screen, ideally.
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  // Weightier than primary and used where the action is structural rather than
  // creative -- save, continue, open. The most common colour in the app.
  dark: 'bg-slate-900 text-white hover:bg-slate-800',
  // Everything alongside a primary: cancel, back, secondary choices.
  secondary: 'bg-slate-200 text-slate-900 hover:bg-slate-300',
  // Publishing and other "this is now real" moments.
  success: 'bg-green-600 text-white hover:bg-green-700',
  // Deleting and disconnecting. Rare on purpose.
  danger: 'bg-red-600 text-white hover:bg-red-700',
  // Sits on a card without competing with it.
  outline: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
  // No chrome at all -- toolbar actions, dismissals.
  ghost: 'text-slate-600 hover:bg-slate-100',
  // Reads as text. For "why?" and "show more" next to real content.
  link: 'text-blue-600 hover:text-blue-700 underline underline-offset-2',
}

const SIZES = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-2.5 text-sm',
}

// link has no box, so padding and background would only misalign it.
const BARE = new Set(['link'])

export default function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  children,
  ...rest
}) {
  const bare = BARE.has(variant)
  return (
    <button
      type={type}
      className={cn(
        'font-medium transition disabled:opacity-50 disabled:cursor-not-allowed',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
        !bare && 'rounded-lg',
        !bare && SIZES[size],
        VARIANTS[variant] || VARIANTS.primary,
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
