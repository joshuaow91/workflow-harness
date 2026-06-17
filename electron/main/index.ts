import { execFile } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  session,
  Menu,
  clipboard,
  nativeTheme,
  nativeImage
} from 'electron'
import { IPC } from '@shared/ipc'
import { registerDevtoolsIpc } from './devtools/registerDevtoolsIpc'
import { registerSettingsIpc } from './settings/registerSettingsIpc'
import { registerAgentIpc } from './agent/registerAgentIpc'
import { registerDatadogIpc } from './datadog/registerDatadogIpc'
import { registerObsidianIpc } from './obsidian/registerObsidianIpc'
import { registerMongoIpc } from './mongo/registerMongoIpc'
import { registerKnowledgeIpc } from './knowledge/registerKnowledgeIpc'
import { registerAutoUpdate } from './autoupdate/registerAutoUpdate'
import { checkSetup } from './system/setupCheck'
import { recordVisit, suggest } from './browser/BrowserStore'
import { gitChanges, gitFileDiff } from './git/DiffService'
import { registerNotifications } from './notifications/registerNotifications'
import { registerClaudeIpc, disposeClaudeWatcher } from './claude/ClaudeStore'
import { registerTerminalIpc, killAllTerminals } from './terminal/registerTerminalIpc'
import { registerBrowserViewIpc, destroyAllBrowserViews } from './browser/registerBrowserViewIpc'
import { setupExtensions } from './browser/extensions'
import { registerWorktreeIpc } from './git/registerWorktreeIpc'
import { registerGithubIpc } from './github/registerGithubIpc'

let mainWindow: BrowserWindow | null = null

// ---- Persist window size/position across restarts ----

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized?: boolean
}

function windowStateFile(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): WindowState | null {
  try {
    return JSON.parse(readFileSync(windowStateFile(), 'utf8')) as WindowState
  } catch {
    return null
  }
}

let saveTimer: NodeJS.Timeout | null = null
function saveWindowState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const maximized = mainWindow.isMaximized()
  const bounds = mainWindow.getNormalBounds()
  try {
    writeFileSync(windowStateFile(), JSON.stringify({ ...bounds, maximized }))
  } catch {
    /* ignore */
  }
}
function scheduleSaveWindowState(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveWindowState, 400)
}

// Give embedded <webview>s a browser-like context menu + new-tab behavior.
function wireGuestWebview(contents: Electron.WebContents): void {
  const openTab = (url: string): void => {
    if (url && url !== 'about:blank' && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.browser.openTab, { url, sourceId: contents.id })
    }
  }
  const openInBrave = (url: string): void => {
    execFile('open', ['-a', 'Brave Browser', url], (err) => {
      if (err) void shell.openExternal(url)
    })
  }

  // target=_blank / window.open / cmd-click → open as a new tab in the workspace.
  contents.setWindowOpenHandler(({ url }) => {
    openTab(url)
    return { action: 'deny' }
  })

  contents.on('context-menu', (_e, params) => {
    const nav = contents.navigationHistory
    const t: Electron.MenuItemConstructorOptions[] = []
    if (params.linkURL) {
      t.push({ label: 'Open Link in New Tab', click: () => openTab(params.linkURL) })
      t.push({ label: 'Open Link in Brave', click: () => openInBrave(params.linkURL) })
      t.push({ label: 'Copy Link', click: () => clipboard.writeText(params.linkURL) })
      t.push({ type: 'separator' })
    }
    if (params.isEditable) {
      t.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' })
    } else if (params.selectionText) {
      t.push({ role: 'copy' }, { type: 'separator' })
    }
    t.push({ label: 'Back', enabled: nav.canGoBack(), click: () => nav.goBack() })
    t.push({ label: 'Forward', enabled: nav.canGoForward(), click: () => nav.goForward() })
    t.push({ label: 'Reload', click: () => contents.reload() })
    t.push({ type: 'separator' })
    t.push({ label: 'Inspect Element', click: () => contents.inspectElement(params.x, params.y) })
    Menu.buildFromTemplate(t).popup()
  })
}

function createWindow(): void {
  const state = loadWindowState()
  mainWindow = new BrowserWindow({
    width: state?.width ?? 1440,
    height: state?.height ?? 900,
    x: state?.x,
    y: state?.y,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // Needed for the embedded browser tab (<webview>). Scoped to our own renderer.
      webviewTag: true
    }
  })

  if (state?.maximized) mainWindow.maximize()

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('resize', scheduleSaveWindowState)
  mainWindow.on('move', scheduleSaveWindowState)
  mainWindow.on('close', saveWindowState)

  mainWindow.webContents.on('did-attach-webview', (_e, contents) => wireGuestWebview(contents))

  // Open target=_blank / window.open links in the system browser, not new Electron windows.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

let totpWindow: BrowserWindow | null = null

function createTotpWindow(): void {
  if (totpWindow && !totpWindow.isDestroyed()) {
    totpWindow.focus()
    return
  }
  totpWindow = new BrowserWindow({
    width: 300,
    height: 260,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    title: 'Authenticator',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  totpWindow.setAlwaysOnTop(true, 'floating')
  totpWindow.on('closed', () => {
    totpWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    totpWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#totp')
  } else {
    totpWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'totp' })
  }
}

function registerIpc(): void {
  // System helpers.
  ipcMain.handle(IPC.system.openExternal, (_e, url: string) => shell.openExternal(url))
  ipcMain.handle(IPC.system.openInBrave, (_e, url: string) => {
    // Hand a URL to the installed Brave app; fall back to the default browser.
    execFile('open', ['-a', 'Brave Browser', url], (err) => {
      if (err) void shell.openExternal(url)
    })
  })
  ipcMain.handle(IPC.system.openTotpWindow, () => createTotpWindow())
  ipcMain.handle(IPC.system.checkSetup, () => checkSetup())
  ipcMain.on(IPC.browser.recordVisit, (_e, url: string, title: string) => recordVisit(url, title))
  ipcMain.handle(IPC.browser.suggest, (_e, query: string) => suggest(query))
  ipcMain.handle(IPC.diff.changes, (_e, path: string, branchMode: boolean) =>
    gitChanges(path, branchMode)
  )
  ipcMain.handle(IPC.diff.fileDiff, (_e, path: string, file: string, branchMode: boolean) =>
    gitFileDiff(path, file, branchMode)
  )
  registerDevtoolsIpc()
  registerSettingsIpc(() => mainWindow)
  registerAgentIpc(() => mainWindow)
  registerDatadogIpc()
  registerObsidianIpc()
  registerMongoIpc()
  registerKnowledgeIpc()
  registerAutoUpdate()
  registerNotifications(() => mainWindow)

  // Feature handlers, registered as each step lands:
  registerClaudeIpc(() => mainWindow)
  registerTerminalIpc(() => mainWindow)
  registerBrowserViewIpc(() => mainWindow)
  registerWorktreeIpc()
  registerGithubIpc()
}

app.on('before-quit', () => {
  void disposeClaudeWatcher()
  killAllTerminals()
  destroyAllBrowserViews()
})

// Hardware acceleration stays ON. It was briefly disabled to stop skia "Invalid
// mailbox" errors during a renderer-reload storm, but that storm's root cause (a
// killAll-on-reload + duplicate-pty loop) is fixed, and the native WebContentsView
// browser REQUIRES GPU compositing — disabling it produced "Failed to create
// context" GL errors and broken page rendering. If the skia mailbox errors ever
// recur, the targeted macOS fix is `--use-angle=metal`, not a blanket disable.

// Present the embedded browser as a normal Chrome so github.com serves its
// standard login flow (the default Electron UA can trigger odd/blocked behavior).
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

// Show the app's own logo in the dock instead of the generic Electron icon.
// Loaded from the repo-committed build/icon.png (relative to the app dir) so it
// works for anyone running the project, not just a local absolute path. In a
// packaged build electron-builder sets the real icon, so this is mainly for dev;
// isEmpty() makes it a safe no-op if the file isn't there.
function setDockIcon(): void {
  if (process.platform !== 'darwin' || !app.dock) return
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'icon.png'))
  if (!icon.isEmpty()) app.dock.setIcon(icon)
}

app.whenReady().then(() => {
  // Make embedded sites (Datadog, GitHub, …) report a dark color scheme.
  nativeTheme.themeSource = 'dark'
  setDockIcon()
  session.fromPartition('persist:harness').setUserAgent(CHROME_UA)
  registerIpc()
  createWindow()
  // Set up Chrome-extension + Web Store support in the BACKGROUND — it must
  // finish before a browser view loads a page, which is always well after the
  // window appears, so it must never block (or hang) window creation.
  void setupExtensions('persist:harness').catch((e) =>
    console.error('[extensions] setup failed:', (e as Error)?.message)
  )

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
