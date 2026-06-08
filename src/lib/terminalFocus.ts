// Lets non-terminal code (keyboard nav) programmatically focus a pane's xterm.
const registry = new Map<string, () => void>()

export function registerTerminalFocus(id: string, focus: () => void): () => void {
  registry.set(id, focus)
  return () => {
    if (registry.get(id) === focus) registry.delete(id)
  }
}

export function focusTerminal(id: string): void {
  registry.get(id)?.()
}
