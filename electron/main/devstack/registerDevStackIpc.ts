import { ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import { devStack } from './DevStackService'

export function registerDevStackIpc(getWindow: () => BrowserWindow | null): void {
  // Push stack state to the renderer whenever it changes (start/stop/exit), so the
  // sidebar's Activate badges stay live without polling.
  devStack.setOnChange(() => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(IPC.devstack.status, devStack.state())
  })

  ipcMain.handle(IPC.devstack.services, () => devStack.services())
  ipcMain.handle(IPC.devstack.state, () => devStack.state())
  ipcMain.handle(IPC.devstack.activate, async (_e, repo: string, cwd: string) => {
    await devStack.activate(repo, cwd)
    return devStack.state()
  })
  ipcMain.handle(IPC.devstack.stop, (_e, repo: string) => {
    devStack.stop(repo)
    return devStack.state()
  })
  ipcMain.handle(IPC.devstack.logs, (_e, repo: string) => devStack.logs(repo))
}

export function stopAllDevStacks(): void {
  devStack.stopAll()
}
