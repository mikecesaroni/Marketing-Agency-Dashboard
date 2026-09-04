/**
 * @param onBack  When given, a "← Back" button appears left of the title. It
 *   is for a modal reached FROM another modal: the point of it is that going
 *   back does not close the one you were in, so whatever you had open and
 *   half-edited is still there when you return. The × still closes outright.
 */
export default function Modal({ isOpen, onClose, onBack, backLabel = 'Back', title, children, wide = false }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center z-50">
      <div
        className={`bg-white w-full shadow-lg max-h-[90vh] overflow-y-auto md:m-4 rounded-t-xl md:rounded-xl ${
          wide ? 'md:max-w-4xl' : 'md:max-w-md'
        }`}
      >
        <div className="sticky top-0 flex justify-between items-center gap-2 p-4 md:p-6 border-b border-slate-200 bg-white">
          <div className="flex min-w-0 items-center gap-2.5">
            {onBack && (
              <button
                onClick={onBack}
                className="flex-shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                ← {backLabel}
              </button>
            )}
            <h2 className="truncate text-lg md:text-xl font-bold text-slate-900">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 text-2xl md:text-3xl font-bold flex-shrink-0"
          >
            ×
          </button>
        </div>
        <div className="p-4 md:p-6">{children}</div>
      </div>
    </div>
  )
}
