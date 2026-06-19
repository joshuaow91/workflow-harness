import { useEffect, useState } from 'react'
import type { WeeklyStats } from '@shared/types'

// "My activity this week" chips in the titlebar. Cached ~10 min in main, polled
// every 5 min, so it's cheap on the gh rate limit. Clicking jumps to the tab.
export function HeaderStats({ onNav }: { onNav: (tab: string) => void }) {
  const [s, setS] = useState<WeeklyStats | null>(null)
  useEffect(() => {
    let active = true
    const load = (): void => {
      void window.api.github
        .weeklyStats()
        .then((d) => active && setS(d))
        .catch(() => undefined)
    }
    load()
    const iv = setInterval(load, 5 * 60 * 1000)
    return () => {
      active = false
      clearInterval(iv)
    }
  }, [])
  if (!s) return null
  return (
    <div className="header-stats">
      <button className="hstat" title="PRs you merged this week" onClick={() => onNav('myprs')}>
        <b>{s.merged}</b> merged
      </button>
      <button className="hstat" title="Your open PRs" onClick={() => onNav('myprs')}>
        <b>{s.open}</b> open
      </button>
    </div>
  )
}
