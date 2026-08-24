// Value, and how it moved against the previous window of the same length.
//
// Direction is not the same as good: cost per lead falling is a win, spend
// falling usually is not. The caller says which, so the colour never implies
// the wrong thing.
export default function StatTile({ label, value, delta, lowerIsBetter = false, sub }) {
  const has = delta != null && Number.isFinite(delta)
  const up = has && delta > 0
  const flat = has && Math.abs(delta) < 0.5
  const good = flat ? null : lowerIsBetter ? !up : up

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        {has ? (
          <>
            <span
              className={
                good === null
                  ? 'text-slate-500'
                  : good
                    ? 'text-green-700'
                    : 'text-red-700'
              }
            >
              {flat ? '±' : up ? '↑' : '↓'} {Math.abs(delta).toFixed(0)}%
            </span>
            <span className="text-slate-400">vs previous period</span>
          </>
        ) : (
          <span className="text-slate-400">{sub || 'No earlier period to compare'}</span>
        )}
      </div>
    </div>
  )
}
