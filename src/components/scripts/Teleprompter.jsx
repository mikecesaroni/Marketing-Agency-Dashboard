import { useEffect, useRef, useState } from 'react'
import { secondsFor } from '../../../supabase/functions/_shared/scriptStudio.js'

/**
 * The teleprompter: the spoken lines, huge, white on black, scrolling at
 * reading pace. Tap the words to start and stop; Slower and Faster change
 * the pace; the A buttons change the size. Made for a phone propped next
 * to the one that is filming, or a laptop behind it.
 */
export default function Teleprompter({ lines, title, onClose }) {
  const box = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [pace, setPace] = useState(1)
  const [size, setSize] = useState(44)
  const [done, setDone] = useState(false)
  const spoken = (Array.isArray(lines) ? lines : []).map((l) => l.say).filter(Boolean)
  const seconds = secondsFor(lines) * 1.15 // a beat of air between lines

  // Scroll a hair every frame so the whole text passes in about the time it
  // takes to say it.
  useEffect(() => {
    if (!playing) return
    const el = box.current
    if (!el) return
    let last = performance.now()
    let raf
    const step = (now) => {
      const el2 = box.current
      if (!el2) return
      const total = el2.scrollHeight - el2.clientHeight
      const pxPerSec = (total / Math.max(5, seconds)) * pace
      el2.scrollTop += (pxPerSec * (now - last)) / 1000
      last = now
      if (el2.scrollTop >= total - 1) {
        setPlaying(false)
        setDone(true)
        return
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, pace, seconds])

  const restart = () => {
    if (box.current) box.current.scrollTop = 0
    setDone(false)
    setPlaying(true)
  }

  const Btn = ({ onClick, children, label }) => (
    <button type="button" onClick={onClick} aria-label={label} className="rounded-xl border border-white/25 px-4 py-3 text-base font-semibold text-white hover:bg-white/10">
      {children}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Teleprompter" data-teleprompter>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-white/70">
        <span className="truncate">{title}</span>
        <button type="button" onClick={onClose} className="rounded-lg border border-white/25 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/10" data-prompter-close>
          Close
        </button>
      </div>
      {/* The room above and below the words is inside the scroller as
          spacers, not padding: padding would keep this box taller than
          the screen and push the buttons off the bottom of a phone. */}
      <div
        ref={box}
        onClick={() => (done ? restart() : setPlaying((p) => !p))}
        className="min-h-0 flex-1 overflow-y-auto px-6 text-center font-semibold leading-tight"
        style={{ fontSize: size }}
        data-prompter-text
      >
        <div style={{ height: '40vh' }} aria-hidden="true" />
        {spoken.map((say, i) => (
          <p key={i} className="mb-10">
            {say}
          </p>
        ))}
        <p className="text-white/40" style={{ fontSize: Math.round(size * 0.6) }}>
          That is the end. Nice work.
        </p>
        <div style={{ height: '60vh' }} aria-hidden="true" />
      </div>
      {!playing && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-lg text-white/60">{done ? 'Tap the words to go again' : 'Tap the words to start'}</div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 px-4 py-3">
        <button type="button" onClick={() => (done ? restart() : setPlaying((p) => !p))} className="rounded-xl bg-orange-600 px-6 py-3 text-base font-bold text-white hover:bg-orange-500" data-prompter-play>
          {playing ? 'Pause' : done ? 'Again' : 'Play'}
        </button>
        <Btn onClick={() => setPace((p) => Math.max(0.5, Math.round((p - 0.1) * 10) / 10))} label="Slower">
          Slower
        </Btn>
        <Btn onClick={() => setPace((p) => Math.min(2, Math.round((p + 0.1) * 10) / 10))} label="Faster">
          Faster
        </Btn>
        <Btn onClick={() => setSize((s) => Math.max(28, s - 6))} label="Smaller text">
          A-
        </Btn>
        <Btn onClick={() => setSize((s) => Math.min(80, s + 6))} label="Bigger text">
          A+
        </Btn>
        <span className="w-full text-center text-xs text-white/50">
          About {Math.round(seconds / pace)} seconds at this pace
        </span>
      </div>
    </div>
  )
}
