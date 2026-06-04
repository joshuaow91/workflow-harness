import { join } from 'path'
import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { registerClaudeIpc, disposeClaudeWatcher } from './claude/ClaudeStore'
import { registerTerminalIpc, killAllTerminals } from './terminal/registerTerminalIpc'

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

function registerIpc(): void {
  // System helpers.
  ipcMain.handle(IPC.system.openExternal, (_e, url: string) => shell.openExternal(url))

  // Feature handlers, registered as each step lands:
  registerClaudeIpc(() => mainWindow)
  registerTerminalIpc(() => mainWindow)
  //   registerWorktreeIpc()                 — step 4
  //   registerGithubIpc()                   — step 6
}

app.on('before-quit', () => {
  void disposeClaudeWatcher()
  killAllTerminals()
})

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
