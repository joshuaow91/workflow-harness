import { useEffect, useState } from 'react'

// Session IDs that finished a turn and need a response. Shared so both the
// sidebar rows and the terminal panes can show the indicator.
const alerts = new Set<string>()
const subs = new Set<() => void>()
const emit = (): void => subs.forEach((cb) => cb())

export const sessionAlerts = {
  has: (id: string): boolean => alerts.has(id),
  add: (id: string): void => {
    if (!alerts.has(id)) {
      alerts.add(id)
      emit()
    }
  },
  clear: (id: string): void => {
    if (alerts.delete(id)) emit()
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
