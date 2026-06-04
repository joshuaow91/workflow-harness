import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { TerminalSpawnOptions } from '@shared/types'
import type { BackendSession } from './TerminalBackend'
import { XtermPtyBackend } from './XtermPtyBackend'

// Single backend instance (the Ghostty seam point). Swap this construction to
// change the terminal engine app-wide.
const backend = new XtermPtyBackend()

const sessions = new Map<string, BackendSession>()

export function registerTerminalIpc(getWindow: () => BrowserWindow | null): void {
  const send = (channel: string, payload: unknown): void => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }

  ipcMain.handle(IPC.terminal.create, (_e, opts: TerminalSpawnOptions): string => {
    const session = backend.spawn(opts)
    sessions.set(session.id, session)

    session.onData((data) => send(IPC.terminal.data, { id: session.id, data }))
    session.onExit(({ exitCode, signal }) => {
      send(IPC.terminal.exit, { id: session.id, exitCode, signal })
      sessions.delete(session.id)
    })

    return session.id
  })

  ipcMain.on(IPC.terminal.write, (_e, id: string, data: string) => {
    sessions.get(id)?.write(data)
  })

  ipcMain.on(IPC.terminal.resize, (_e, id: string, cols: number, rows: number) => {
    sessions.get(id)?.resize(cols, rows)
  })

  ipcMain.on(IPC.terminal.kill, (_e, id: string) => {
    const session = sessions.get(id)
    if (session) {
      session.kill()
      sessions.delete(id)
    }
  })
}

export function killAllTerminals(): void {
  for (const session of sessions.values()) session.kill()
  sessions.clear()
}
