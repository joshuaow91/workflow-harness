import { randomUUID } from 'crypto'
import * as pty from 'node-pty'
import type { TerminalSpawnOptions } from '@shared/types'
import type { BackendSession, TerminalBackend } from './TerminalBackend'

function defaultShell(): string {
  return process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh')
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
      env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>
    })

    if (opts.initialCommand) {
      // Let the interactive prompt initialize, then type the command.
      const cmd = opts.initialCommand
      setTimeout(() => this.proc.write(cmd + '\r'), 250)
    }
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
