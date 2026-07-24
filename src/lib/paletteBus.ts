// Lets any surface (e.g. the sidebar's launcher row) open the command palette,
// which AppShell owns.
type Cb = () => void
const subs = new Set<Cb>()

export const paletteBus = {
  open(): void {
    subs.forEach((cb) => cb())
  },
  subscribe(cb: Cb): () => void {
    subs.add(cb)
    return () => subs.delete(cb)
  }
}
