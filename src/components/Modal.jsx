export default function Modal({ isOpen, onClose, title, children, wide = false }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center z-50">
      <div
        className={`bg-white w-full shadow-lg max-h-[90vh] overflow-y-auto md:m-4 rounded-t-xl md:rounded-xl ${
          wide ? 'md:max-w-4xl' : 'md:max-w-md'
        }`}
      >
        <div className="sticky top-0 flex justify-between items-center p-4 md:p-6 border-b border-slate-200 bg-white">
          <h2 className="text-lg md:text-xl font-bold text-slate-900">{title}</h2>
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
