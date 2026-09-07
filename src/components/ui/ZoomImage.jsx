import { useEffect, useState } from 'react'

/**
 * A thumbnail that enlarges on hover, the way the Studio's artboards do.
 *
 * Hovering opens the full-size image fixed over the page; clicking pins it so
 * it can be read, and a click anywhere or Escape closes it. The overlay is
 * transparent to the mouse until pinned, so the hover that opened it is never
 * interrupted by it. The same file is shown at both sizes: saved ads are
 * 1080px PNGs displayed small, so there is nothing to re-render.
 *
 * Renders only the <img>; the caller lays it out. Any props not listed go to
 * the thumbnail so existing className/style/loading attributes keep working.
 */
export default function ZoomImage({ src, alt = '', caption, ...imgProps }) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)

  const close = () => {
    setPinned(false)
    setOpen(false)
  }

  useEffect(() => {
    if (!pinned) return
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinned])

  return (
    <>
      <img
        {...imgProps}
        src={src}
        alt={alt}
        onMouseEnter={() => !pinned && setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onClick={(e) => {
          e.preventDefault()
          setOpen(true)
          setPinned(true)
        }}
        className={`cursor-zoom-in transition hover:ring-2 hover:ring-orange-300 ${imgProps.className || ''}`}
      />
      {open && (
        <div
          className={`fixed inset-0 z-[60] flex flex-col items-center justify-center gap-2 bg-slate-900/80 p-4 ${
            pinned ? '' : 'pointer-events-none'
          }`}
          onClick={pinned ? close : undefined}
        >
          <img
            src={src}
            alt={alt}
            className="rounded bg-slate-100 shadow-2xl"
            style={{ maxHeight: '86vh', maxWidth: '94vw', width: 'auto', height: 'auto' }}
          />
          <p className="text-xs text-white/80">
            {caption ? `${caption} · ` : ''}
            {pinned ? 'click anywhere or press Escape to close' : 'click to keep it open'}
          </p>
        </div>
      )}
    </>
  )
}
