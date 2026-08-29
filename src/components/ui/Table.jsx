import { cn } from './cn'

/**
 * The data table.
 *
 * Every table in this app was hand-built the same way and drifted anyway:
 * px-4 py-3 cells, a slate-50 header, a hairline between rows. What matters
 * more than the padding is `numeric`, which right-aligns a column AND sets
 * tabular-nums. Without it a column of money jitters as the digits change
 * width, and a client looking at a report notices that even if they could not
 * name it.
 *
 * The horizontal scroller lives inside the card rather than on the page, so a
 * wide table on a phone scrolls itself instead of dragging the whole layout
 * sideways past the fixed nav.
 */

export function Table({ className, children }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_0_rgb(15_23_42_/_0.04)]">
      <div className="overflow-x-auto">
        <table className={cn('w-full text-sm', className)}>{children}</table>
      </div>
    </div>
  )
}

export function THead({ children }) {
  return <thead className="border-b border-slate-200 bg-slate-50/70">{children}</thead>
}

export function TBody({ children }) {
  return <tbody>{children}</tbody>
}

export function Tr({ tone, className, children, ...rest }) {
  return (
    <tr
      className={cn(
        'border-b border-slate-100 transition last:border-b-0',
        tone === 'warning' ? 'bg-amber-50 hover:bg-amber-100/70' : 'hover:bg-slate-50',
        className
      )}
      {...rest}
    >
      {children}
    </tr>
  )
}

/**
 * Column headings borrow the sidebar's group labels: small, uppercase, widely
 * tracked, grey. A heading set in the same weight and colour as the data under
 * it competes with the data; set like this it recedes and the numbers read
 * first, which is the whole job of a table.
 */
export function Th({ numeric, className, children, ...rest }) {
  return (
    <th
      className={cn(
        'px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500',
        numeric ? 'text-right' : 'text-left',
        className
      )}
      {...rest}
    >
      {children}
    </th>
  )
}

export function Td({ numeric, muted, className, children, ...rest }) {
  return (
    <td
      className={cn(
        'px-4 py-3',
        numeric && 'text-right tabular-nums',
        muted && 'text-slate-600',
        className
      )}
      {...rest}
    >
      {children}
    </td>
  )
}
