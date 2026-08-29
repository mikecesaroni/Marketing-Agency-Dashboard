import { cn } from './cn'

/**
 * The small coloured word: a status, a count, a label on a row.
 *
 * These were being written inline as a background, a text colour, a radius and
 * a text size every time, which is four decisions per badge and the reason no
 * two of them quite matched.
 */

const TONES = {
  neutral: 'bg-slate-100 text-slate-700',
  info: 'bg-blue-100 text-blue-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  // For "paused" and similar: present, deliberately quiet.
  dim: 'bg-slate-100 text-slate-500',
}

export default function Badge({ tone = 'neutral', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        TONES[tone] || TONES.neutral,
        className
      )}
    >
      {children}
    </span>
  )
}
