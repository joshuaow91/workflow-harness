import { execFile } from 'child_process'
import { join } from 'path'
import { app, BrowserWindow, shell, ipcMain, session } from 'electron'
import { IPC } from '@shared/ipc'
import { registerDevtoolsIpc } from './devtools/registerDevtoolsIpc'
import { registerSettingsIpc } from './settings/registerSettingsIpc'
import { registerClaudeIpc, disposeClaudeWatcher } from './claude/ClaudeStore'
import { registerTerminalIpc, killAllTerminals } from './terminal/registerTerminalIpc'
import { registerWorktreeIpc } from './git/registerWorktreeIpc'
import { registerGithubIpc } from './github/registerGithubIpc'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
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

  mainWindow.on('ready-to-show', () => mainWindow?.show())

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
  registerDevtoolsIpc()
  registerSettingsIpc(() => mainWindow)

  // Feature handlers, registered as each step lands:
  registerClaudeIpc(() => mainWindow)
  registerTerminalIpc(() => mainWindow)
  registerWorktreeIpc()
  registerGithubIpc()
}

app.on('before-quit', () => {
  void disposeClaudeWatcher()
  killAllTerminals()
})

// Present the embedded browser as a normal Chrome so github.com serves its
// standard login flow (the default Electron UA can trigger odd/blocked behavior).
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

app.whenReady().then(() => {
  session.fromPartition('persist:harness').setUserAgent(CHROME_UA)
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
