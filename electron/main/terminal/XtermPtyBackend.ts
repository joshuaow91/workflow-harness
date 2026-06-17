import { randomUUID } from 'crypto'
import * as pty from 'node-pty'
import type { TerminalSpawnOptions } from '@shared/types'
import type { BackendSession, TerminalBackend } from './TerminalBackend'

function defaultShell(): string {
  return process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh')
}

// Environment for a pane shell. Strip Claude session vars so a pane's `claude`
// runs as a clean TOP-LEVEL session. The harness may itself be launched from
// inside a Claude session (notably during development), which exports
// CLAUDECODE / CLAUDE_CODE_* — inheriting those makes the pane's claude run in
// nested/child mode: it won't register a ~/.claude/sessions file (so the sidebar
// can't detect it as live) and may behave differently. No-op when the harness is
// launched normally (a plain terminal or the packaged .app).
function paneEnv(): Record<string, string> {
  const env: Record<string, string> = {
    ...process.env,
    TERM: 'xterm-256color'
  } as Record<string, string>
  for (const k of Object.keys(env)) {
    if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')) delete env[k]
  }
  return env
}

class PtySession implements BackendSession {
  readonly id = randomUUID()
  private readonly proc: pty.IPty

  constructor(opts: TerminalSpawnOptions) {
    const shell = defaultShell()
    // Login shell so PATH picks up ~/.local/bin (where `claude` lives), nvm, etc.
    const args = process.platform === 'win32' ? [] : ['-l']
    this.proc = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cwd: opts.cwd,
      cols: opts.cols ?? 80,
      rows: opts.rows ?? 24,
      env: paneEnv()
    })

    if (opts.initialCommand) {
      // Let the interactive prompt initialize, then type the command.
      const cmd = opts.initialCommand
      setTimeout(() => this.proc.write(cmd + '\r'), 250)
    }
  }

  get pid(): number {
    return this.proc.pid
  }

  write(data: string): void {
    this.proc.write(data)
  }

  resize(cols: number, rows: number): void {
    try {
      this.proc.resize(Math.max(1, cols), Math.max(1, rows))
    } catch {
      /* pty may have exited */
    }
  }

  kill(): void {
    try {
      this.proc.kill()
    } catch {
      /* already dead */
    }
  }

  onData(cb: (data: string) => void): void {
    this.proc.onData(cb)
  }

  onExit(cb: (info: { exitCode: number; signal?: number }) => void): void {
    this.proc.onExit(({ exitCode, signal }) => cb({ exitCode, signal }))
  }
}

export class XtermPtyBackend implements TerminalBackend {
  spawn(opts: TerminalSpawnOptions): BackendSession {
    return new PtySession(opts)
  }
}
