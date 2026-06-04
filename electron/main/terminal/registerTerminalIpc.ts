import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { TerminalSpawnOptions } from '@shared/types'
import type { BackendSession } from './TerminalBackend'
import { XtermPtyBackend } from './XtermPtyBackend'

// Single backend instance (the Ghostty seam point). Swap this construction to
// change the terminal engine app-wide.
const backend = new XtermPtyBackend()

const sessions = new Map<string, BackendSession>()
// Recent output per session, so a re-mounted pane (layout change / reorder) can
// replay history instead of showing a blank terminal. The PTY keeps running.
const buffers = new Map<string, string>()
const MAX_BUFFER = 256 * 1024

export function registerTerminalIpc(getWindow: () => BrowserWindow | null): void {
  const send = (channel: string, payload: unknown): void => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }

  ipcMain.handle(IPC.terminal.create, (_e, opts: TerminalSpawnOptions): string => {
    const session = backend.spawn(opts)
    sessions.set(session.id, session)
    buffers.set(session.id, '')

    session.onData((data) => {
      const buf = (buffers.get(session.id) ?? '') + data
      buffers.set(session.id, buf.length > MAX_BUFFER ? buf.slice(-MAX_BUFFER) : buf)
      send(IPC.terminal.data, { id: session.id, data })
    })
    session.onExit(({ exitCode, signal }) => {
      send(IPC.terminal.exit, { id: session.id, exitCode, signal })
      sessions.delete(session.id)
      buffers.delete(session.id)
    })

    return session.id
  })

  ipcMain.handle(IPC.terminal.getBuffer, (_e, id: string): string => buffers.get(id) ?? '')

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
      buffers.delete(id)
    }
  })
}

export function killAllTerminals(): void {
  for (const session of sessions.values()) session.kill()
  sessions.clear()
}
