import { execFile } from 'child_process'
import { promisify } from 'util'
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { AutoUpdateStatus, UpdateResult } from '@shared/types'
import { getSettings } from '../settings/SettingsStore'
import { discoverRepos } from '../git/WorktreeService'

const pexec = promisify(execFile)
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await pexec('git', args, { cwd, maxBuffer: 1024 * 1024 })
  return stdout.trim()
}
async function tryGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    return await git(cwd, args)
  } catch {
    return null
  }
}

let running = false
let lastRunAt: number | null = null
let lastResults: UpdateResult[] = []
let anchor = Date.now()

// Fast-forward one worktree from its upstream — safely. Never merges/rebases.
async function updateWorktree(path: string): Promise<Omit<UpdateResult, 'repo' | 'branch'>> {
  const status = await tryGit(path, ['status', '--porcelain'])
  if (status === null) return { status: 'error', detail: 'not a git worktree' }
  if (status.trim() !== '') return { status: 'skipped', detail: 'uncommitted changes' }
  const upstream = await tryGit(path, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
  if (!upstream) return { status: 'skipped', detail: 'no upstream' }
  try {
    const out = await git(path, ['pull', '--ff-only'])
    return /up to date/i.test(out)
      ? { status: 'skipped', detail: 'already up to date' }
      : { status: 'updated' }
  } catch {
    return { status: 'skipped', detail: 'diverged — needs manual rebase/merge' }
  }
}

async function runUpdate(): Promise<UpdateResult[]> {
  if (running) return lastResults
  running = true
  const results: UpdateResult[] = []
  try {
    const repos = await discoverRepos()
    for (const repo of repos) {
      await tryGit(repo.path, ['fetch', '--all', '--prune'])
      for (const wt of repo.worktrees) {
        const r = await updateWorktree(wt.path)
        results.push({ repo: repo.name, branch: wt.branch ?? '(detached)', ...r })
      }
    }
  } finally {
    running = false
    lastRunAt = Date.now()
    anchor = Date.now()
    lastResults = results
  }
  return results
}

function periodMs(): number | null {
  const v = getSettings().autoUpdateRepos
  if (v === 'hourly') return 60 * 60 * 1000
  if (v === 'daily') return 24 * 60 * 60 * 1000
  return null
}

export function registerAutoUpdate(): void {
  setInterval(
    () => {
      const p = periodMs()
      if (p && !running && Date.now() - anchor >= p) void runUpdate()
    },
    10 * 60 * 1000
  )

  ipcMain.handle(IPC.autoUpdate.runNow, () => runUpdate())
  ipcMain.handle(
    IPC.autoUpdate.status,
    (): AutoUpdateStatus => ({
      interval: getSettings().autoUpdateRepos,
      lastRunAt,
      running,
      results: lastResults
    })
  )
}
