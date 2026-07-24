import type { AgentState } from '@shared/types'

// Classify what an agent pane is doing from its terminal output — the same idea as
// herdr's "screen manifest": strip ANSI off the recent bottom-buffer and match the
// visible text. Blocked detection is deliberately strict; a false "blocked" is
// worse than a missed one, because it cries wolf in the rollups.

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b[()][A-Z0-9]/g

/** The visible text of the recent output, ANSI stripped and whitespace collapsed. */
export function visibleTail(raw: string, chars = 3000): string {
  return raw.slice(-chars * 3).replace(ANSI, ' ').replace(/\s+/g, ' ')
}

// Waiting on a human: permission prompts, plan approval, y/n confirmations.
const BLOCKED = [
  /Do you want to (?:proceed|continue|create|make|allow)/i,
  /Would you like to proceed/i,
  /❯\s*1\.\s*Yes/,
  /\(y\/n\)/i,
  /Press Enter to continue/i
]

// Actively running — claude shows an interrupt affordance while it works.
const WORKING = [/esc to interrupt/i, /\besc\b to stop/i]

/**
 * Next state from the visible tail. `prev` matters because "done" is a transition,
 * not a pattern: a run that stops being `working` has finished, and stays finished
 * until you engage with it again (see `onUserInput`).
 */
export function classify(tail: string, prev: AgentState): AgentState {
  if (BLOCKED.some((r) => r.test(tail))) return 'blocked'
  if (WORKING.some((r) => r.test(tail))) return 'working'
  if (prev === 'working') return 'done'
  return prev === 'done' ? 'done' : 'idle'
}

/** Typing into a pane clears a finished run back to idle. */
export function onUserInput(prev: AgentState): AgentState {
  return prev === 'done' ? 'idle' : prev
}

/** Worst state wins when rolling pane state up to a tab or the sidebar. */
const RANK: Record<AgentState, number> = { blocked: 3, working: 2, done: 1, idle: 0 }
export function worst(states: AgentState[]): AgentState {
  return states.reduce<AgentState>((a, b) => (RANK[b] > RANK[a] ? b : a), 'idle')
}
