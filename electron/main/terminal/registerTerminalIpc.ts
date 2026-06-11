import { execFile } from 'child_process'
import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { TerminalSpawnOptions } from '@shared/types'
import type { BackendSession } from './TerminalBackend'
import { XtermPtyBackend } from './XtermPtyBackend'

const pexec = promisify(execFile)

// Resolve the claude session currently running inside a pty (by its pid). Walks
// the process tree so it stays correct across `/clear` (which spawns a new
// session id on the same pty) — far more robust than the renderer guessing.
async function sessionForPtyPid(ptyPid: number): Promise<string | null> {
  const sdir = join(homedir(), '.claude', 'sessions')
  const live: { pid: number; sessionId: string; updatedAt: number }[] = []
  try {
    for (const f of readdirSync(sdir)) {
      if (!f.endsWith('.json')) continue
      try {
        const o = JSON.parse(readFileSync(join(sdir, f), 'utf8')) as {
          pid?: number
          sessionId?: string
          updatedAt?: number
        }
        if (o.sessionId && typeof o.pid === 'number')
          live.push({ pid: o.pid, sessionId: o.sessionId, updatedAt: o.updatedAt ?? 0 })
      } catch {
        /* ignore */
      }
    }
  } catch {
    return null
  }
  if (!live.length) return null

  const ppid: Record<number, number> = {}
  try {
    const { stdout } = await pexec('ps', ['-axo', 'pid=,ppid='])
    for (const line of stdout.split('\n')) {
      const m = line.trim().match(/^(\d+)\s+(\d+)$/)
      if (m) ppid[Number(m[1])] = Number(m[2])
    }
  } catch {
    return null
  }
  const isDescendant = (pid: number): boolean => {
    let p = pid
    for (let n = 0; p && p !== 1 && n < 50; n++) {
      if (p === ptyPid) return true
      p = ppid[p]
    }
    return false
  }
  const matches = live.filter((s) => isDescendant(s.pid)).sort((a, b) => b.updatedAt - a.updatedAt)
  return matches[0]?.sessionId ?? null
}

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

  ipcMain.handle(IPC.terminal.sessionFor, (_e, id: string): Promise<string | null> => {
    const s = sessions.get(id)
    return s ? sessionForPtyPid(s.pid) : Promise.resolve(null)
  })

  // Durable layout backup on disk, mirroring the renderer's localStorage. Survives
  // an HMR/state wipe so the layout can always be recovered (see getLayout below).
  const layoutFile = (): string => join(app.getPath('userData'), 'terminal-layout.json')
  ipcMain.handle(IPC.terminal.saveLayout, (_e, json: string) => {
    try {
      if (json && json.length > 2) writeFileSync(layoutFile(), json)
    } catch {
      /* ignore */
    }
  })
  ipcMain.handle(IPC.terminal.getLayout, (): string => {
    try {
      return readFileSync(layoutFile(), 'utf8')
    } catch {
      return ''
    }
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
      buffers.delete(id)
    }
  })
}

export function killAllTerminals(): void {
  for (const session of sessions.values()) session.kill()
  sessions.clear()
}
