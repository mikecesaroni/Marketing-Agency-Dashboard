import Card from './Card'
import { cn } from './cn'

/**
 * One headline number in a card.
 *
 * The dashboard and the payments page each had their own copy of this, four
 * tones apiece, and the tones were used as decoration: a normal week showed
 * four differently coloured boxes and none of them meant anything. There is
 * one `alert` flag instead, so when a card does go red it is because something
 * is wrong and it is the only red thing on the row.
 */
export default function StatCard({ label, value, sub, delta, alert, className, onClick, hint }) {
  return (
    <Card
      tone={alert ? 'danger' : 'default'}
      className={cn(
        'min-w-0',
        // A card that opens something says so by behaving like a control. Only
        // when it actually does: a hover state on a card that does nothing is
        // worse than no affordance at all.
        onClick && 'w-full cursor-pointer text-left transition hover:border-slate-300 hover:shadow-md',
        className
      )}
      {...(onClick
        ? {
            as: 'button',
            type: 'button',
            onClick,
            title: hint,
          }
        : {})}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums tracking-tight',
          alert ? 'text-red-700' : 'text-slate-900'
        )}
      >
        {value}
      </p>
      {(sub || delta) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {sub && <p className="text-xs text-slate-500">{sub}</p>}
          {delta}
        </div>
      )}
    </Card>
  )
}
