import { useSyncExternalStore } from 'react'
import type { AgentState } from '@shared/types'

// Live agent state per terminal id, pushed from main (see agentState.ts).
// Panes read their own state; tabs and the sidebar roll up the worst one.

const states = new Map<string, AgentState>()
const subs = new Set<() => void>()
let snapshot: Record<string, AgentState> = {}

function emit(): void {
  snapshot = Object.fromEntries(states)
  for (const s of subs) s()
}

// The bridge lives in the preload, which only loads on a harness restart — guard
// so the UI degrades to "no states" instead of crashing before that.
window.api.terminal.onState?.(({ id, state }) => {
  states.set(id, state)
  emit()
})

export function useAgentStates(): Record<string, AgentState> {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => snapshot
  )
}

const RANK: Record<AgentState, number> = { blocked: 3, working: 2, done: 1, idle: 0 }

/** Worst state wins, so a blocked pane colours its tab and the sidebar. */
export function worstState(list: AgentState[]): AgentState | null {
  if (!list.length) return null
  return list.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'idle' as AgentState)
}
