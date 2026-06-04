import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { AppSettings } from '@shared/types'
import { getSettings, setSettings } from './SettingsStore'

export function registerSettingsIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.settings.get, (): AppSettings => getSettings())
  ipcMain.handle(IPC.settings.set, (_e, patch: Partial<AppSettings>): AppSettings =>
    setSettings(patch)
  )

  ipcMain.handle(
    IPC.system.pickDirectory,
    async (_e, defaultPath?: string): Promise<string | null> => {
      const win = getWindow()
      const opts: Electron.OpenDialogOptions = {
        properties: ['openDirectory', 'createDirectory'],
        defaultPath
      }
      const result = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts)
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
    }
  )
}
