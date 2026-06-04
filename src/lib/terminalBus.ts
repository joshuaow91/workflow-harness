import type { TerminalSpawnOptions } from '@shared/types'

// Tiny renderer-side pub/sub so the sidebar can request a terminal without the
// terminals tab and sidebar knowing about each other. AppShell subscribes to
// switch tabs; TerminalsTab subscribes to add a pane.
type Listener = (opts: TerminalSpawnOptions) => void

const listeners = new Set<Listener>()

export const terminalBus = {
  open(opts: TerminalSpawnOptions): void {
    for (const l of listeners) l(opts)
  },
  subscribe(l: Listener): () => void {
    listeners.add(l)
    return () => listeners.delete(l)
  }
}
