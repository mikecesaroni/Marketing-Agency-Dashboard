import { cn } from './cn'

/**
 * A titled block within a longer screen.
 *
 * PublishToMetaPanel, AdStudioPanel and AiScanReport each grew their own
 * private version of this -- Section, Field, Stat -- which is the same idea
 * invented three times and drifting apart in three directions.
 *
 * `step` is optional and renders the numbered bubble the publish flow uses, so
 * a form with an order to it can show that order without a second component.
 */
export default function Section({ step, title, hint, actions, className, children }) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            {step && (
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                {step}
              </span>
            )}
            <div className="min-w-0">
              {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
              {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
