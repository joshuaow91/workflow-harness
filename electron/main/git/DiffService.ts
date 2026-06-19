import { execFile } from 'child_process'
import { promisify } from 'util'
import type { FileChange, GitChanges } from '@shared/types'

const pexec = promisify(execFile)

// Returns stdout even on non-zero exit (git diff --no-index returns 1 when files differ).
async function gitOut(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await pexec('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 })
    return stdout
  } catch (e) {
    return (e as { stdout?: string }).stdout ?? ''
  }
}

async function defaultBase(path: string): Promise<string> {
  const head = (await gitOut(path, ['rev-parse', '--abbrev-ref', 'origin/HEAD'])).trim()
  if (head && head !== 'origin/HEAD') return head
  for (const b of ['main', 'master']) {
    if ((await gitOut(path, ['rev-parse', '--verify', `origin/${b}`])).trim()) return `origin/${b}`
  }
  return 'HEAD'
}

// `ref` lets the Changes tab diff a branch that isn't checked out (base...<ref>),
// not just the working copy's HEAD. Falls back to HEAD when omitted.
export async function gitChanges(
  path: string,
  branchMode: boolean,
  ref?: string
): Promise<GitChanges> {
  const tip = ref || 'HEAD'
  const base = branchMode ? await defaultBase(path) : null
  const range = base ? [`${base}...${tip}`] : ['HEAD']
  const files = new Map<string, FileChange>()

  for (const line of (await gitOut(path, ['diff', '--numstat', ...range])).split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    const a = parts[0]
    const d = parts[1]
    const p = parts.slice(2).join('\t')
    if (!p) continue
    files.set(p, {
      path: p,
      status: 'M',
      additions: a === '-' ? 0 : Number(a),
      deletions: d === '-' ? 0 : Number(d),
      binary: a === '-'
    })
  }
  for (const line of (await gitOut(path, ['diff', '--name-status', ...range])).split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    const code = parts[0][0]
    const p = parts[parts.length - 1]
    const f = files.get(p) ?? { path: p, status: 'M', additions: 0, deletions: 0, binary: false }
    f.status = code
    files.set(p, f)
  }
  if (!base) {
    for (const line of (await gitOut(path, ['status', '--porcelain'])).split('\n')) {
      if (line.startsWith('?? ')) {
        const p = line.slice(3)
        files.set(p, { path: p, status: '?', additions: 0, deletions: 0, binary: false })
      }
    }
  }
  return { base, files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)) }
}

export async function gitFileDiff(
  path: string,
  file: string,
  branchMode: boolean,
  ref?: string
): Promise<string> {
  if (branchMode) {
    const base = await defaultBase(path)
    return gitOut(path, ['diff', `${base}...${ref || 'HEAD'}`, '--', file])
  }
  const tracked = (await gitOut(path, ['ls-files', '--error-unmatch', '--', file])).trim()
  if (!tracked) return gitOut(path, ['diff', '--no-index', '--', '/dev/null', file])
  return gitOut(path, ['diff', 'HEAD', '--', file])
}
