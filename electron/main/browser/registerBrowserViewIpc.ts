import { ipcMain, WebContentsView, type BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import { recordVisit } from './BrowserStore'
import {
  trackExtensionTab,
  untrackExtensionTab,
  selectExtensionTab,
  attachContextMenu
} from './extensions'

// Main-process browser views. Each is a WebContentsView (a native layer composited
// over the renderer) keyed by a string viewId. Because the view lives here and not
// in the React DOM, switching tabs/panes just hides/repositions it — the page,
// scroll, and session survive (the whole point of moving off <webview>).

interface Rect {
  x: number
  y: number
  width: number
  height: number
}
interface ManagedView {
  view: WebContentsView
  bounds: Rect
  wantVisible: boolean
  favicon?: string
}

const views = new Map<string, ManagedView>()

/** Tear down every browser view (app quit / window close). WebContentsViews are
 *  not auto-destroyed with the window, so we must close them to avoid leaks. */
export function destroyAllBrowserViews(): void {
  for (const m of views.values()) {
    try {
      m.view.webContents.close()
    } catch {
      /* ignore */
    }
  }
  views.clear()
}

export function registerBrowserViewIpc(getWindow: () => BrowserWindow | null): void {
  const send = (channel: string, payload: unknown): void => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }

  const pushState = (id: string): void => {
    const m = views.get(id)
    if (!m || m.view.webContents.isDestroyed()) return
    const wc = m.view.webContents
    send(IPC.browserView.state, {
      id,
      url: wc.getURL(),
      title: wc.getTitle(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      loading: wc.isLoading(),
      webContentsId: wc.id,
      favicon: m.favicon
    })
  }

  // Push the desired visibility + bounds to the native view. Bounds are DIPs
  // (logical points) straight from the renderer's getBoundingClientRect — do NOT
  // scale by devicePixelRatio.
  const apply = (m: ManagedView): void => {
    try {
      m.view.setVisible(m.wantVisible)
      if (m.wantVisible) {
        m.view.setBounds({
          x: Math.round(m.bounds.x),
          y: Math.round(m.bounds.y),
          width: Math.round(m.bounds.width),
          height: Math.round(m.bounds.height)
        })
      }
    } catch {
      /* view detached */
    }
  }

  ipcMain.handle(
    IPC.browserView.create,
    (_e, id: string, url: string, partition: string): number => {
      const win = getWindow()
      if (!win) return -1
      const existing = views.get(id)
      if (existing) return existing.view.webContents.id

      const view = new WebContentsView({ webPreferences: { partition } })
      view.setBackgroundColor('#1e1e2e')
      win.contentView.addChildView(view)
      const m: ManagedView = { view, bounds: { x: 0, y: 0, width: 0, height: 0 }, wantVisible: false }
      views.set(id, m)
      view.setVisible(false)

      const wc = view.webContents
      // Register with the Chrome-extension engine so content scripts, the action
      // API, and contextMenus apply to this page; add a Chrome-style right-click
      // menu (merged with any installed extensions' contextMenus).
      trackExtensionTab(wc, win)
      attachContextMenu(wc, (url) => {
        if (url && url !== 'about:blank') send(IPC.browser.openTab, { url, sourceId: wc.id })
      })

      // Links opening a new window become a new workspace tab (reuses the
      // existing browser:openTab routing).
      wc.setWindowOpenHandler(({ url: target }) => {
        if (target && target !== 'about:blank') send(IPC.browser.openTab, { url: target, sourceId: wc.id })
        return { action: 'deny' }
      })
      const onNav = (): void => pushState(id)
      wc.on('did-navigate', () => {
        m.favicon = undefined // new page — drop the old favicon until it reports one
        onNav()
      })
      wc.on('did-navigate-in-page', onNav)
      wc.on('did-start-loading', onNav)
      wc.on('did-stop-loading', () => {
        onNav()
        try {
          recordVisit(wc.getURL(), wc.getTitle())
        } catch {
          /* ignore */
        }
      })
      wc.on('page-title-updated', onNav)
      wc.on('page-favicon-updated', (_e, favicons) => {
        m.favicon = favicons?.[0]
        pushState(id)
      })

      // found-in-page results -> renderer find bar.
      wc.on('found-in-page', (_e, result) => {
        send(IPC.browserView.findResult, {
          id,
          activeMatchOrdinal: result.activeMatchOrdinal,
          matches: result.matches
        })
      })

      // The page is a native view, so when it has focus the renderer DOM never
      // sees browser keyboard shortcuts. Intercept the common ones and forward
      // them so the React UI can act (find bar, address focus, tab ops, nav).
      wc.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return
        const mod = input.meta || input.control
        if (!mod) return
        const k = input.key.toLowerCase()
        const fwd = (action: string): void => {
          event.preventDefault()
          send(IPC.browserView.shortcut, { id, action })
        }
        if (k === 'f') fwd('find')
        else if (k === 'l') fwd('focusAddress')
        else if (k === 'r') fwd('reload')
        else if (k === 't') fwd('newTab')
        else if (k === 'w') fwd('closeTab')
        else if (k === '[') fwd('back')
        else if (k === ']') fwd('forward')
      })

      void wc.loadURL(url)
      return wc.id
    }
  )

  ipcMain.handle(IPC.browserView.destroy, (_e, id: string) => {
    const m = views.get(id)
    if (!m) return
    try {
      if (!m.view.webContents.isDestroyed()) untrackExtensionTab(m.view.webContents)
    } catch {
      /* ignore */
    }
    try {
      getWindow()?.contentView.removeChildView(m.view)
    } catch {
      /* ignore */
    }
    try {
      m.view.webContents.close()
    } catch {
      /* ignore */
    }
    views.delete(id)
  })

  ipcMain.handle(IPC.browserView.setBounds, (_e, id: string, bounds: Rect) => {
    const m = views.get(id)
    if (!m) return
    m.bounds = bounds
    apply(m)
  })

  ipcMain.handle(IPC.browserView.setVisible, (_e, id: string, visible: boolean) => {
    const m = views.get(id)
    if (!m) return
    m.wantVisible = visible
    apply(m)
    // Tell the extension engine which tab is active (chrome.tabs active queries,
    // action API targeting the foreground page).
    if (visible && !m.view.webContents.isDestroyed()) selectExtensionTab(m.view.webContents)
  })

  ipcMain.handle(IPC.browserView.loadURL, (_e, id: string, url: string) => {
    const m = views.get(id)
    if (m) void m.view.webContents.loadURL(url)
  })
  ipcMain.handle(IPC.browserView.goBack, (_e, id: string) => {
    const wc = views.get(id)?.view.webContents
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
  })
  ipcMain.handle(IPC.browserView.goForward, (_e, id: string) => {
    const wc = views.get(id)?.view.webContents
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
  })
  ipcMain.handle(IPC.browserView.reload, (_e, id: string) => {
    views.get(id)?.view.webContents.reload()
  })
  ipcMain.handle(IPC.browserView.stop, (_e, id: string) => {
    views.get(id)?.view.webContents.stop()
  })

  ipcMain.handle(
    IPC.browserView.find,
    (_e, id: string, text: string, forward: boolean, findNext: boolean) => {
      const wc = views.get(id)?.view.webContents
      if (wc && text) wc.findInPage(text, { forward, findNext })
    }
  )
  ipcMain.handle(IPC.browserView.stopFind, (_e, id: string) => {
    views.get(id)?.view.webContents.stopFindInPage('clearSelection')
  })
}
