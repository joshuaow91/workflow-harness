import { useEffect } from 'react'

// Native WebContentsView browsers are composited ABOVE the React DOM and ignore
// CSS z-index, so any DOM overlay that must appear over a page (command palette,
// modals, dropdowns spanning the page area) has to hide the views while it's
// open. This is a global suspend counter the views subscribe to.

type Listener = (suspended: boolean) => void

let count = 0
const listeners = new Set<Listener>()

function emit(): void {
  const suspended = count > 0
  for (const l of listeners) l(suspended)
}

export const browserViewBus = {
  /** Hide every native browser view until the returned release() is called.
   *  Nestable — views stay hidden until the last release(). */
  suspend(): () => void {
    count++
    if (count === 1) emit()
    let released = false
    return () => {
      if (released) return
      released = true
      count = Math.max(0, count - 1)
      if (count === 0) emit()
    }
  },
  isSuspended(): boolean {
    return count > 0
  },
  subscribe(l: Listener): () => void {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }
}

/** Hide all native browser views while `active` (e.g. a modal is mounted). */
export function useSuspendBrowserViews(active = true): void {
  useEffect(() => {
    if (!active) return
    return browserViewBus.suspend()
  }, [active])
}
