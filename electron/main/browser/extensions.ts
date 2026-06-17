import { join } from 'path'
import { app, session as electronSession, type BaseWindow, type WebContents } from 'electron'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { installChromeWebStore } from 'electron-chrome-web-store'
import { buildChromeContextMenu } from 'electron-chrome-context-menu'

// Chrome-extension support for the harness's native browser views. The engine
// (electron-chrome-extensions) implements the chrome.* APIs on a session; the
// web store add-on lets the user install extensions straight from
// chromewebstore.google.com; the context-menu add-on gives a Chrome-style
// right-click menu. Set up once after app ready, before any page loads.

let extensions: ElectronChromeExtensions | null = null

/** Installed extensions live here so they persist across restarts. */
export function extensionsDir(): string {
  return join(app.getPath('userData'), 'Extensions')
}

export function extensionsInstance(): ElectronChromeExtensions | null {
  return extensions
}

export async function setupExtensions(partition: string): Promise<void> {
  if (extensions) return
  const ses = electronSession.fromPartition(partition)

  // Never let an extension-engine failure stop the app from booting — on error,
  // `extensions` stays null and every helper below no-ops.
  try {
    extensions = new ElectronChromeExtensions({ license: 'GPL-3.0', session: ses })
    // Required for <browser-action-list> toolbar icons to load via crx://.
    ElectronChromeExtensions.handleCRXProtocol(ses)
  } catch (e) {
    extensions = null
    console.error('[extensions] engine init failed:', (e as Error).message)
    return
  }

  // Enable installing from the Chrome Web Store + auto-load previously installed
  // extensions from disk (installChromeWebStore loads them by default).
  try {
    await installChromeWebStore({ session: ses, extensionsPath: extensionsDir() })
  } catch (e) {
    console.error('[extensions] web store setup failed:', (e as Error).message)
  }
}

/** Track a browser view's webContents as a tab so content scripts, the action
 *  API, and contextMenus apply to it. */
export function trackExtensionTab(wc: WebContents, window: BaseWindow): void {
  try {
    extensions?.addTab(wc, window)
  } catch {
    /* engine not ready */
  }
}
export function untrackExtensionTab(wc: WebContents): void {
  try {
    extensions?.removeTab(wc)
  } catch {
    /* ignore */
  }
}
export function selectExtensionTab(wc: WebContents): void {
  try {
    extensions?.selectTab(wc)
  } catch {
    /* ignore */
  }
}

/** Wire a Chrome-style right-click menu (back/forward/reload, link & image
 *  actions, copy, inspect) merged with any installed extensions' contextMenus. */
export function attachContextMenu(wc: WebContents, openInTab: (url: string) => void): void {
  wc.on('context-menu', (_e, params) => {
    const menu = buildChromeContextMenu({
      params,
      webContents: wc,
      extensionMenuItems: extensions?.getContextMenuItems(wc, params),
      openLink: (url) => openInTab(url)
    })
    menu.popup()
  })
}
