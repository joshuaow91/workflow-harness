// Routes "open link in new tab" requests to the tab-group that owns the webview
// the link came from — so a link clicked inside the Issues view opens a tab in
// the Issues view, not the separate Browser workspace.

export interface BrowserGroup {
  /** Does the given webContents id belong to one of this group's webviews? */
  ownsWc: (id: number) => boolean
  /** Open a new tab in this group. */
  addTab: (url: string) => void
}

const groups = new Set<BrowserGroup>()
let fallback: BrowserGroup | null = null

export const browserRouter = {
  register(g: BrowserGroup): () => void {
    groups.add(g)
    return () => groups.delete(g)
  },
  /** The Browser workspace registers as the fallback for unowned sources. */
  setFallback(g: BrowserGroup): () => void {
    fallback = g
    return () => {
      if (fallback === g) fallback = null
    }
  },
  dispatch(url: string, sourceId: number): void {
    for (const g of groups) {
      if (g.ownsWc(sourceId)) {
        g.addTab(url)
        return
      }
    }
    fallback?.addTab(url)
  }
}
