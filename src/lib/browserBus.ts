// Renderer pub/sub for "open this URL as a new browser-workspace tab" requests,
// which originate from embedded webview context menus (main -> IPC -> here).
type Listener = (url: string) => void

const listeners = new Set<Listener>()

export const browserBus = {
  open(url: string): void {
    for (const l of listeners) l(url)
  },
  subscribe(l: Listener): () => void {
    listeners.add(l)
    return () => listeners.delete(l)
  }
}
