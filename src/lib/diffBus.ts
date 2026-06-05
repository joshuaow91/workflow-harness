// Lets the sidebar request a diff view: openTab focuses the Changes tab on a
// path; openModal pops a quick diff modal for a path.
type TabCb = (path: string) => void
type ModalCb = (path: string, title: string) => void

const tabSubs = new Set<TabCb>()
const modalSubs = new Set<ModalCb>()

export const diffBus = {
  onTab(cb: TabCb): () => void {
    tabSubs.add(cb)
    return () => tabSubs.delete(cb)
  },
  openTab(path: string): void {
    tabSubs.forEach((cb) => cb(path))
  },
  onModal(cb: ModalCb): () => void {
    modalSubs.add(cb)
    return () => modalSubs.delete(cb)
  },
  openModal(path: string, title: string): void {
    modalSubs.forEach((cb) => cb(path, title))
  }
}
