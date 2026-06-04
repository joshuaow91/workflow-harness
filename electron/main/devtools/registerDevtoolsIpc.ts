import { ipcMain, webContents } from 'electron'
import { IPC } from '@shared/ipc'

// Renders one webview's DevTools *inside* another webview (the bottom pane),
// using Electron's setDevToolsWebContents. The renderer passes webContents ids
// it obtains from each <webview> via getWebContentsId() after 'dom-ready'.

export function registerDevtoolsIpc(): void {
  ipcMain.handle(IPC.devtools.attach, (_e, targetId: number, devtoolsId: number) => {
    const target = webContents.fromId(targetId)
    const dt = webContents.fromId(devtoolsId)
    if (!target || !dt) return
    // Re-point cleanly if devtools were already open on this (or another) target.
    if (target.isDevToolsOpened()) target.closeDevTools()
    target.setDevToolsWebContents(dt)
    target.openDevTools()
    // Nudge the embedded devtools to lay out at the pane's size.
    setTimeout(() => {
      if (!target.isDestroyed()) target.devToolsWebContents?.focus()
    }, 200)
  })

  ipcMain.handle(IPC.devtools.detach, (_e, targetId: number) => {
    const target = webContents.fromId(targetId)
    if (target && !target.isDestroyed() && target.isDevToolsOpened()) target.closeDevTools()
  })
}
