import { useEffect, useRef, useState } from 'react'

/**
 * The jump bar on a client page: one pill per section, pinned under the
 * header, so Files or Payments is a click rather than a scroll past
 * everything above it. The pill for the section on screen is lit, and the
 * bar scrolls sideways on a phone rather than wrapping into three rows.
 *
 * `sections` is [{ id, label }] in page order; every id is the id of a
 * wrapper on the page. Nothing here knows what the sections hold.
 *
 * The header's height is measured rather than assumed: a long client name
 * or the stacked buttons on a phone make it taller, and a bar pinned at a
 * guessed height slid under it.
 */
export default function ClientJumpBar({ sections }) {
  const [active, setActive] = useState(sections[0]?.id || '')
  const [headerH, setHeaderH] = useState(76)
  const bar = useRef(null)
  // The pill clicked last, and whether its section has been on screen since
  // (a smooth scroll takes a moment to get there).
  const clicked = useRef('')
  const seen = useRef(false)

  useEffect(() => {
    const header = document.querySelector('header')
    if (!header || typeof ResizeObserver === 'undefined') return
    const measure = () => setHeaderH(Math.round(header.getBoundingClientRect().height))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(header)
    return () => ro.disconnect()
  }, [])

  // Where a section's top should land: just under the header and the bar.
  const lineY = () => headerH + (bar.current?.getBoundingClientRect().height || 41) + 12

  // Which section is on screen: the last one whose top has passed the line
  // just under the bar. A scroll listener rather than IntersectionObserver,
  // because a tall section with its top off screen is still "the one you
  // are in", and an observer would call it gone.
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const line = lineY() + 8
      let current = sections[0]?.id || ''
      for (const s of sections) {
        const el = document.getElementById(s.id)
        if (el && el.getBoundingClientRect().top <= line) current = s.id
      }
      // The pill that was clicked stays lit while its section is on screen:
      // the last sections never reach the line at the foot of the page, and
      // the one you asked for is the one you are looking at.
      const want = clicked.current ? document.getElementById(clicked.current)?.getBoundingClientRect() : null
      const onScreen = want && want.top < window.innerHeight - 40 && want.bottom > line
      if (onScreen) {
        current = clicked.current
        seen.current = true
      } else if (seen.current) {
        // It arrived and has gone again: the reader scrolled on.
        clicked.current = ''
        seen.current = false
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    // Capture, because the page scrolls inside <body> (html and body both
    // set overflow), and a scroll event never bubbles to the window.
    update()
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, headerH])

  const go = (id) => {
    const el = document.getElementById(id)
    if (!el) return
    clicked.current = id
    seen.current = false
    setActive(id)
    // scrollIntoView finds whichever box scrolls; the margin keeps the
    // section's top clear of the header and the bar.
    el.style.scrollMarginTop = `${lineY()}px`
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // The address carries the section, so a copied link lands on it too.
    try {
      window.history.replaceState(null, '', `#${id}`)
    } catch {
      // Nothing: the scroll already happened.
    }
  }

  return (
    <nav
      ref={bar}
      aria-label="Jump to a section"
      style={{ top: headerH }}
      className="sticky z-20 -mx-4 mb-4 border-b border-slate-200 bg-slate-50/95 px-4 backdrop-blur md:-mx-8 md:px-8"
      data-jump-bar
    >
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(s.id)}
            aria-current={active === s.id ? 'location' : undefined}
            data-jump={s.id}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition ${
              active === s.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
