import { useEffect, useState } from 'react'

// Session IDs that finished a turn and need a response. Shared so both the
// sidebar rows and the terminal panes can show the indicator.
const alerts = new Set<string>()
// Sessions the user already acknowledged (clicked into / resumed) for the
// CURRENT waiting episode — don't re-blink until the session moves on.
const acked = new Set<string>()
const subs = new Set<() => void>()
const emit = (): void => subs.forEach((cb) => cb())

export const sessionAlerts = {
  has: (id: string): boolean => alerts.has(id),

  /** Raise an alert unless already alerting or acknowledged. Returns true if newly raised. */
  tryAdd: (id: string): boolean => {
    if (acked.has(id) || alerts.has(id)) return false
    alerts.add(id)
    emit()
    return true
  },

  /** User acknowledged it (clicked in / resumed): stop blinking, suppress re-alerts. */
  clear: (id: string): void => {
    const had = alerts.delete(id)
    const newAck = !acked.has(id)
    if (newAck) acked.add(id)
    if (had) emit()
  },

  /** Session moved on (back to working): forget the episode so the next wait re-alerts. */
  reset: (id: string): void => {
    const had = alerts.delete(id)
    acked.delete(id)
    if (had) emit()
  },

  subscribe: (cb: () => void): (() => void) => {
    subs.add(cb)
    return () => {
      subs.delete(cb)
    }
  }
}

export function useSessionAlerts(): Set<string> {
  const [snap, setSnap] = useState<Set<string>>(() => new Set(alerts))
  useEffect(() => sessionAlerts.subscribe(() => setSnap(new Set(alerts))), [])
  return snap
}
