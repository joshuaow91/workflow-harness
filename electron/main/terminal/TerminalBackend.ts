import type { TerminalSpawnOptions } from '@shared/types'

// The seam that keeps the rest of the app terminal-engine-agnostic.
//
// v1 ships `XtermPtyBackend` (node-pty + xterm.js, data-in/data-out). A future
// `GhosttySurfaceBackend` would implement the same lifecycle but own both its
// pixels and its PTY via libghostty's `ghostty_surface_t`, mounting a native
// view handle instead of emitting a data stream. Because the contract is
// session-shaped (not raw-byte-shaped), swapping it in won't touch callers.

export interface BackendSession {
  readonly id: string
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(cb: (data: string) => void): void
  onExit(cb: (info: { exitCode: number; signal?: number }) => void): void
}

export interface TerminalBackend {
  spawn(opts: TerminalSpawnOptions): BackendSession
}
