import { cn } from './cn'

/**
 * A labelled input, and the inputs themselves.
 *
 * There were three different input looks in the app: the onboarding form used
 * px-2 py-1 with a bare border, the panels used px-3 py-2 with a slate border,
 * and anything inside a modal added a focus ring. Three heights and three
 * focus behaviours, on forms a client fills in and on forms that spend money.
 *
 * The `sm` size is the old panel-dense look and `md` the old form look, so
 * both survive as a deliberate choice rather than as an accident of which file
 * the field happened to be in.
 */

const CONTROL = {
  sm: 'px-2 py-1 text-sm',
  md: 'px-3 py-2 text-sm',
  lg: 'px-3 py-2.5 text-sm',
}

function controlClasses(size, invalid) {
  return cn(
    'w-full rounded-lg border bg-white text-slate-900 placeholder:text-slate-400',
    'focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500',
    invalid
      ? 'border-red-300 focus:ring-red-400'
      : 'border-slate-300 focus:ring-blue-400',
    CONTROL[size] || CONTROL.md
  )
}

export function Input({ size = 'md', invalid, className, ...rest }) {
  return <input className={cn(controlClasses(size, invalid), className)} {...rest} />
}

export function Textarea({ size = 'md', invalid, className, rows = 3, ...rest }) {
  return (
    <textarea rows={rows} className={cn(controlClasses(size, invalid), className)} {...rest} />
  )
}

export function Select({ size = 'md', invalid, className, children, ...rest }) {
  return (
    <select className={cn(controlClasses(size, invalid), className)} {...rest}>
      {children}
    </select>
  )
}

/**
 * Label, control, and the line underneath.
 *
 * `hint` is for what someone needs to know before typing; `error` replaces it
 * when there is something to fix, because showing both is how a form ends up
 * with two lines of grey text and one of them ignored.
 */
export default function Field({ label, hint, error, required, htmlFor, className, children }) {
  return (
    <div className={cn('space-y-1', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-600">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[11px] text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-slate-400">{hint}</p>
      ) : null}
    </div>
  )
}
