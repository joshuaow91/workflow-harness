import { useEffect, useState } from 'react'

// Live status for sessions open in a harness terminal pane. claude often does NOT
// write a ~/.claude/sessions/<pid>.json for a resumed-in-pty session, so the
// sidebar's file-based liveness misses them. The harness spawned these panes, so
// we derive status from the pty output stream instead: claude streams output
// (spinner/token counts) while working and goes quiet when idle — so "output
// flowing" ⇒ busy, and the last output time ⇒ last-active.

export interface PaneStatus {
  /** Open in a pane (alive). */
  live: boolean
  /** Output seen very recently — claude is working / the pane is active. */
  busy: boolean
  /** Epoch ms of the last pty output (for "Nm ago"). */
  lastActive: number
}

const IDLE_AFTER_MS = 1400

let status = new Map<string, PaneStatus>() // sessionId -> status
let tid2sid = new Map<string, string>() // terminalId -> sessionId
const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()
const subs = new Set<() => void>()
const emit = (): void => subs.forEach((cb) => cb())

export const openSessions = {
  has: (id: string): boolean => status.has(id),
  get: (id: string): PaneStatus | undefined => status.get(id),

  /** Set the current panes (terminalId + sessionId). Preserves prior activity. */
  setPanes(panes: { terminalId: string; sessionId: string }[]): void {
    const next = new Map<string, PaneStatus>()
    const map = new Map<string, string>()
    for (const p of panes) {
      if (!p.sessionId) continue
      if (p.terminalId) map.set(p.terminalId, p.sessionId)
      next.set(p.sessionId, status.get(p.sessionId) ?? { live: true, busy: false, lastActive: Date.now() })
    }
    tid2sid = map
    const changed = next.size !== status.size || [...next.keys()].some((k) => !status.has(k))
    status = next
    if (changed) emit()
  },

  /** Record pty output for a terminal — marks its session busy + bumps last-active. */
  noteOutput(terminalId: string): void {
    const sid = tid2sid.get(terminalId)
    if (!sid) return
    const s = status.get(sid)
    if (!s) return
    s.lastActive = Date.now()
    const wasBusy = s.busy
    s.busy = true
    const t = idleTimers.get(sid)
    if (t) clearTimeout(t)
    idleTimers.set(
      sid,
      setTimeout(() => {
        const cur = status.get(sid)
        if (cur) {
          cur.busy = false
          emit()
        }
      }, IDLE_AFTER_MS)
    )
    if (!wasBusy) emit()
  }
}

/** Subscribe to pane status (re-renders on change). */
export function usePaneSessions(): Map<string, PaneStatus> {
  const [, force] = useState(0)
  useEffect(() => {
    const cb = (): void => force((n) => n + 1)
    subs.add(cb)
    return () => void subs.delete(cb)
  }, [])
  return status
}

// Renderless: publishes the current panes AND taps the pty output stream — placed
// as a child so the host component's own hooks/state are untouched (no remount).
export function OpenSessionsSync({ panes }: { panes: { terminalId: string; sessionId: string }[] }): null {
  const key = panes.map((p) => `${p.terminalId}:${p.sessionId}`).sort().join('|')
  useEffect(() => {
    openSessions.setPanes(panes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  // Tap output once: every pane's bytes flow through here to drive busy/idle.
  useEffect(() => window.api.terminal.onData((e) => openSessions.noteOutput(e.id)), [])
  return null
}
