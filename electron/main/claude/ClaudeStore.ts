import { readdir, readFile, rm, unlink } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { ClaudeProject, ClaudeSession } from '@shared/types'
import { parseSessionFile } from './jsonlSession'
import { displayNameFromPath, slugToPathFallback } from './slug'
import { activeProvider, providers } from '../agents/registry'

const CLAUDE_DIR = join(homedir(), '.claude')
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects')
const SESSIONS_DIR = join(CLAUDE_DIR, 'sessions')

interface LiveInfo {
  pid: number
  status: string
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // ESRCH = no such process; EPERM = alive but not ours (still alive).
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Every alive process whose session file carries this sessionId (a session can
 * have several when it was opened in multiple panes). */
async function pidsForSession(sessionId: string): Promise<number[]> {
  let files: string[]
  try {
    files = await readdir(SESSIONS_DIR)
  } catch {
    return []
  }
  const pids: number[] = []
  await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => {
        try {
          const o = JSON.parse(await readFile(join(SESSIONS_DIR, f), 'utf8')) as {
            sessionId?: string
            pid?: number
          }
          if (o.sessionId === sessionId && typeof o.pid === 'number' && isProcessAlive(o.pid))
            pids.push(o.pid)
        } catch {
          /* ignore */
        }
      })
  )
  return [...new Set(pids)]
}

/** Map of sessionId -> live info, for sessions whose pid is an alive process. */
async function readLiveSessions(): Promise<Map<string, LiveInfo>> {
  const live = new Map<string, LiveInfo>()
  let files: string[]
  try {
    files = await readdir(SESSIONS_DIR)
  } catch {
    return live
  }
  await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => {
        try {
          const raw = await readFile(join(SESSIONS_DIR, f), 'utf8')
          const o = JSON.parse(raw) as { sessionId?: string; pid?: number; status?: string }
          if (o.sessionId && typeof o.pid === 'number' && isProcessAlive(o.pid)) {
            live.set(o.sessionId, { pid: o.pid, status: o.status ?? 'idle' })
          }
        } catch {
          /* ignore malformed session file */
        }
      })
  )
  return live
}

/** Pick the most frequent non-null cwd among a project's sessions. */
function resolveProjectPath(slug: string, sessions: ClaudeSession[]): string {
  const counts = new Map<string, number>()
  for (const s of sessions) {
    if (s.cwd) counts.set(s.cwd, (counts.get(s.cwd) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [path, n] of counts) {
    if (n > bestN) {
      best = path
      bestN = n
    }
  }
  return best ?? slugToPathFallback(slug)
}

function activityKey(s: { lastActivityAt: string | null; startedAt: string | null }): number {
  const t = s.lastActivityAt ?? s.startedAt
  return t ? Date.parse(t) : 0
}

export async function buildProjects(): Promise<ClaudeProject[]> {
  const live = await readLiveSessions()

  let slugs: string[]
  try {
    const entries = await readdir(PROJECTS_DIR, { withFileTypes: true })
    slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }

  const projects: ClaudeProject[] = []

  await Promise.all(
    slugs.map(async (slug) => {
      const dir = join(PROJECTS_DIR, slug)
      let jsonlFiles: string[]
      try {
        jsonlFiles = (await readdir(dir)).filter((f) => f.endsWith('.jsonl'))
      } catch {
        return
      }
      if (jsonlFiles.length === 0) return

      const metas = (await Promise.all(jsonlFiles.map((f) => parseSessionFile(join(dir, f))))).filter(
        (m): m is NonNullable<typeof m> => m !== null
      )
      if (metas.length === 0) return

      const sessions: ClaudeSession[] = metas.map((m) => ({
        sessionId: m.sessionId,
        title: m.title,
        cwd: m.cwd ?? '',
        gitBranch: m.gitBranch,
        startedAt: m.startedAt,
        lastActivityAt: m.lastActivityAt,
        live: live.get(m.sessionId) ?? null,
        messageCount: m.messageCount
      }))

      sessions.sort((a, b) => activityKey(b) - activityKey(a))

      const path = resolveProjectPath(slug, sessions)
      // Backfill empty cwd with the resolved project path for display/launch.
      for (const s of sessions) if (!s.cwd) s.cwd = path

      projects.push({ slug, path, name: displayNameFromPath(path), sessions })
    })
  )

  projects.sort((a, b) => activityKey(b.sessions[0]) - activityKey(a.sessions[0]))
  return projects
}

/** Delete a session transcript (and its sidecar dir) from disk. */
export async function deleteSession(slug: string, sessionId: string): Promise<void> {
  const dir = join(PROJECTS_DIR, slug)
  await unlink(join(dir, `${sessionId}.jsonl`)).catch(() => {})
  await rm(join(dir, sessionId), { recursive: true, force: true }).catch(() => {})
}

let watcher: FSWatcher | null = null

export function registerClaudeIpc(getWindow: () => BrowserWindow | null): void {
  // Session/sidebar IPCs route to the active agent provider (Claude, Codex, …).
  ipcMain.handle(IPC.claude.getProjects, () => activeProvider().getProjects())
  ipcMain.handle(IPC.claude.deleteSession, (_e, slug: string, sessionId: string) =>
    activeProvider().deleteSession(slug, sessionId)
  )
  // Close a live session: terminate ALL its processes (a session opened in several
  // panes has several) so the row reliably flips to dormant. The conversation
  // stays on disk and is resumable; only the running processes are killed.
  ipcMain.handle(IPC.claude.killSession, async (_e, sessionId: string) => {
    const pids = await pidsForSession(sessionId)
    for (const p of pids) {
      try {
        process.kill(p, 'SIGTERM')
      } catch {
        /* gone */
      }
    }
    // A busy claude can catch SIGTERM and linger, and an immediate refresh races
    // the processes actually dying — so escalate to SIGKILL for any survivors,
    // then refresh once they're truly gone.
    const settle = (): void => {
      for (const p of pids) {
        if (isProcessAlive(p)) {
          try {
            process.kill(p, 'SIGKILL')
          } catch {
            /* gone */
          }
        }
      }
      pushUpdate()
    }
    setTimeout(settle, 1500)
    pushUpdate() // optimistic immediate refresh
  })
  ipcMain.handle(IPC.claude.sessionTasks, (_e, sessionId: string) => activeProvider().sessionTasks(sessionId))
  ipcMain.handle(IPC.claude.sessionLinks, (_e, sessionId: string) => activeProvider().sessionLinks(sessionId))
  ipcMain.handle(IPC.claude.sessionPlan, (_e, sessionId: string) => activeProvider().sessionPlan(sessionId))

  let timer: NodeJS.Timeout | null = null
  const pushUpdate = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(async () => {
      const projects = await activeProvider().getProjects()
      const win = getWindow()
      if (win && !win.isDestroyed()) win.webContents.send(IPC.claude.sidebarUpdate, projects)
    }, 300)
  }

  const watchPaths = [...new Set(providers.flatMap((p) => p.watchPaths()))]
  watcher = chokidar.watch(watchPaths, {
    ignoreInitial: true,
    depth: 2,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
  })
  watcher.on('all', pushUpdate)
}

export async function disposeClaudeWatcher(): Promise<void> {
  await watcher?.close()
  watcher = null
}
