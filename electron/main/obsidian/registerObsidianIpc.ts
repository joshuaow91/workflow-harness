import { readdir, readFile, stat, writeFile } from 'fs/promises'
import { basename, join, relative } from 'path'
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { ObsidianNote } from '@shared/types'
import { getSettings } from '../settings/SettingsStore'

const SKIP_DIRS = new Set(['.obsidian', '.trash', '.git', 'node_modules'])

export const NO_VAULT = 'NO_VAULT'

function vaultDir(): string {
  const v = getSettings().obsidianVault
  if (!v) throw new Error(NO_VAULT)
  return v
}

async function walk(dir: string, root: string, out: ObsidianNote[]): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) await walk(join(dir, e.name), root, out)
    } else if (e.name.endsWith('.md')) {
      const full = join(dir, e.name)
      const rel = relative(root, full)
      let mtime = 0
      try {
        mtime = (await stat(full)).mtimeMs
      } catch {
        /* ignore */
      }
      out.push({
        path: rel,
        title: basename(e.name, '.md'),
        folder: relative(root, dir),
        mtime
      })
    }
  }
}

function safeJoin(root: string, rel: string): string {
  const full = join(root, rel)
  if (!full.startsWith(root)) throw new Error('Path outside vault')
  return full
}

export function registerObsidianIpc(): void {
  ipcMain.handle(IPC.obsidian.listNotes, async (): Promise<ObsidianNote[]> => {
    const root = vaultDir()
    const out: ObsidianNote[] = []
    await walk(root, root, out)
    out.sort((a, b) => b.mtime - a.mtime)
    return out
  })

  ipcMain.handle(IPC.obsidian.readNote, (_e, rel: string): Promise<string> => {
    return readFile(safeJoin(vaultDir(), rel), 'utf8')
  })

  ipcMain.handle(IPC.obsidian.saveNote, (_e, rel: string, content: string): Promise<void> => {
    return writeFile(safeJoin(vaultDir(), rel), content, 'utf8')
  })
}
