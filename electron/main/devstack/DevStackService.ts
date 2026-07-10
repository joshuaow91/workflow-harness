import { spawn, execFile, type ChildProcess } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { app } from 'electron'
import type { DevService, DevStackEntry } from '@shared/types'

const pexec = promisify(execFile)

// Approach A: a repo's dev server can be launched from any of its worktrees, but
// always on the same canonical port — so cross-service URLs, the Vite proxy, and
// the WorkOS redirect URI (all pinned to fixed ports) keep working with no env
// edits. Only one worktree owns a repo's port at a time; activating another stops
// the previous. Seeded defaults; the user can edit userData/devstack.json.
const DEFAULT_SERVICES: DevService[] = [
  {
    repo: 'blink_server',
    command: './gradlew bootRun --no-daemon',
    port: 8080,
    browserUrl: 'http://localhost:8080',
    env: {
      JAVA_HOME:
        '/Users/joshuaow/Library/Java/JavaVirtualMachines/corretto-11.0.31/Contents/Home',
      GRADLE_OPTS: '-Xmx4g'
    }
  },
  {
    repo: 'blink_dashboard',
    command: 'npm run dev',
    port: 5173,
    browserUrl: 'http://localhost:5173'
  }
]

const MAX_LOG_CHARS = 200_000

interface Running {
  service: DevService
  cwd: string
  proc: ChildProcess
  log: string
  startedAt: number
}

export class DevStackService {
  private running = new Map<string, Running>() // keyed by repo name
  private lastLog = new Map<string, string>() // logs kept after a stack stops
  private onChange?: () => void

  setOnChange(cb: () => void): void {
    this.onChange = cb
  }
  private emit(): void {
    this.onChange?.()
  }

  private configPath(): string {
    return join(app.getPath('userData'), 'devstack.json')
  }

  services(): DevService[] {
    try {
      if (existsSync(this.configPath())) {
        const parsed = JSON.parse(readFileSync(this.configPath(), 'utf8')) as DevService[]
        if (Array.isArray(parsed) && parsed.length) return parsed
      }
    } catch {
      /* fall through to defaults */
    }
    try {
      writeFileSync(this.configPath(), JSON.stringify(DEFAULT_SERVICES, null, 2))
    } catch {
      /* read-only fs — defaults still work in-memory */
    }
    return DEFAULT_SERVICES
  }

  serviceFor(repo: string): DevService | undefined {
    return this.services().find((s) => s.repo === repo)
  }

  // Kill whatever is LISTENing on the port (the previously-active stack, or a dev
  // server the user started by hand) so the new stack can bind the canonical port.
  private async freePort(port: number): Promise<void> {
    const listeners = async (): Promise<number[]> => {
      try {
        const { stdout } = await pexec('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'])
        return stdout
          .split('\n')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n) && n > 0)
      } catch {
        return []
      }
    }
    const first = await listeners()
    for (const pid of first) {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        /* gone */
      }
    }
    if (!first.length) return
    await new Promise((r) => setTimeout(r, 800))
    for (const pid of await listeners()) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* gone */
      }
    }
  }

  async activate(repo: string, cwd: string): Promise<void> {
    const service = this.serviceFor(repo)
    if (!service) throw new Error(`No dev-stack config for ${repo}`)
    this.stop(repo) // stop this repo's current stack, if any
    await this.freePort(service.port)

    // detached:true -> the shell becomes a process-group leader, so we can kill the
    // whole tree (npm->vite, gradle->java) with one signal to the negative pid.
    const proc = spawn(service.command, {
      cwd,
      shell: true,
      detached: true,
      env: { ...process.env, ...(service.env ?? {}) }
    })
    const entry: Running = { service, cwd, proc, log: '', startedAt: Date.now() }
    const append = (d: Buffer): void => {
      entry.log += d.toString()
      if (entry.log.length > MAX_LOG_CHARS) entry.log = entry.log.slice(-MAX_LOG_CHARS)
    }
    proc.stdout?.on('data', append)
    proc.stderr?.on('data', append)
    proc.on('exit', (code, signal) => {
      append(Buffer.from(`\n[dev stack exited: code=${code ?? '?'} signal=${signal ?? '-'}]\n`))
      if (this.running.get(repo) === entry) {
        this.lastLog.set(repo, entry.log)
        this.running.delete(repo)
        this.emit()
      }
    })
    this.running.set(repo, entry)
    this.emit()
  }

  stop(repo: string): void {
    const r = this.running.get(repo)
    if (!r) return
    this.running.delete(repo)
    this.lastLog.set(repo, r.log)
    const pid = r.proc.pid
    if (pid) {
      try {
        process.kill(-pid, 'SIGTERM') // whole process group
      } catch {
        try {
          r.proc.kill('SIGTERM')
        } catch {
          /* already gone */
        }
      }
      setTimeout(() => {
        try {
          process.kill(-pid, 'SIGKILL')
        } catch {
          /* already gone */
        }
      }, 1500)
    }
    this.emit()
  }

  stopAll(): void {
    for (const repo of [...this.running.keys()]) this.stop(repo)
  }

  state(): DevStackEntry[] {
    return [...this.running.values()].map((r) => ({
      repo: r.service.repo,
      cwd: r.cwd,
      port: r.service.port,
      browserUrl: r.service.browserUrl,
      running: true,
      pid: r.proc.pid,
      startedAt: r.startedAt
    }))
  }

  logs(repo: string): string {
    return this.running.get(repo)?.log ?? this.lastLog.get(repo) ?? ''
  }
}

export const devStack = new DevStackService()
