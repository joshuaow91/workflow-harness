import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Lightweight custom tooltip: wraps a trigger, shows a styled bubble on hover after
// a short delay. Portals to <body> so it escapes the sidebar's overflow, positions
// above the trigger (flips below if there's no room), and clamps to the viewport.
export function Tooltip({ tip, children }: { tip: ReactNode; children: ReactNode }) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const [shown, setShown] = useState(false)
  const [xy, setXy] = useState({ left: 0, top: 0 })

  const enter = (): void => {
    timer.current = window.setTimeout(() => setShown(true), 350)
  }
  const leave = (): void => {
    window.clearTimeout(timer.current)
    setShown(false)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])

  // useLayoutEffect measures + repositions before paint, so the bubble never
  // flashes at the origin.
  useLayoutEffect(() => {
    if (!shown) return
    const w = wrapRef.current?.getBoundingClientRect()
    const t = tipRef.current?.getBoundingClientRect()
    if (!w || !t) return
    const left = Math.max(6, Math.min(w.left + w.width / 2 - t.width / 2, window.innerWidth - t.width - 6))
    const top = w.top - t.height - 7 < 6 ? w.bottom + 7 : w.top - t.height - 7
    setXy({ left, top })
  }, [shown])

  return (
    <span ref={wrapRef} className="tip-wrap" onMouseEnter={enter} onMouseLeave={leave} onMouseDown={leave}>
      {children}
      {shown &&
        tip != null &&
        createPortal(
          <div ref={tipRef} className="tip" style={{ left: xy.left, top: xy.top }} role="tooltip">
            {tip}
          </div>,
          document.body
        )}
    </span>
  )
}
