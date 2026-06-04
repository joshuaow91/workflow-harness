import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { readdir } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import type { Repo, Worktree } from '@shared/types'

const pexec = promisify(execFile)

// Root that the sidebar scans for repos. Matches the user's code directory.
export const CODE_ROOT = join(homedir(), 'Documents', 'Code')
const WORKTREE_ROOT = join(CODE_ROOT, '.worktrees')

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

function parseNameWithOwner(remoteUrl: string | null): string | null {
  if (!remoteUrl) return null
  // git@github.com:owner/name.git  |  https://github.com/owner/name(.git)
  const m = remoteUrl.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/)
  return m ? m[1] : null
}

function parseWorktreeList(porcelain: string): Worktree[] {
  const trees: Worktree[] = []
  let cur: Partial<Worktree> & { path?: string } = {}
  const flush = (): void => {
    if (cur.path) {
      trees.push({
        path: cur.path,
        branch: cur.branch ?? null,
        head: cur.head ?? null,
        isMain: trees.length === 0,
        locked: cur.locked ?? false
      })
    }
    cur = {}
  }
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) {
      flush()
      cur.path = line.slice('worktree '.length)
    } else if (line.startsWith('HEAD ')) {
      cur.head = line.slice('HEAD '.length)
    } else if (line.startsWith('branch ')) {
      cur.branch = line.slice('branch '.length).replace('refs/heads/', '')
    } else if (line === 'detached') {
      cur.branch = null
    } else if (line.startsWith('locked')) {
      cur.locked = true
    }
  }
  flush()
  return trees
}

async function loadRepo(name: string, path: string): Promise<Repo> {
  const [remote, branch, wtList] = await Promise.all([
    tryGit(path, ['remote', 'get-url', 'origin']),
    tryGit(path, ['rev-parse', '--abbrev-ref', 'HEAD']),
    tryGit(path, ['worktree', 'list', '--porcelain'])
  ])
  return {
    name,
    path,
    nameWithOwner: parseNameWithOwner(remote),
    currentBranch: branch,
    worktrees: wtList ? parseWorktreeList(wtList) : []
  }
}

export async function discoverRepos(): Promise<Repo[]> {
  let entries
  try {
    entries = await readdir(CODE_ROOT, { withFileTypes: true })
  } catch {
    return []
  }
  const repos = await Promise.all(
    entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => ({ name: e.name, path: join(CODE_ROOT, e.name) }))
      .filter(({ path }) => existsSync(join(path, '.git')))
      .map(({ name, path }) => loadRepo(name, path))
  )
  repos.sort((a, b) => a.name.localeCompare(b.name))
  return repos
}

function sanitizeBranchForPath(branch: string): string {
  return branch.replace(/[^\w.-]+/g, '-')
}

export async function addWorktree(
  repoPath: string,
  branch: string,
  fromRef?: string
): Promise<Worktree> {
  const repoName = repoPath.split('/').filter(Boolean).pop() ?? 'repo'
  const dest = join(WORKTREE_ROOT, repoName, sanitizeBranchForPath(branch))

  const branchExists =
    (await tryGit(repoPath, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])) !== null

  if (branchExists) {
    await git(repoPath, ['worktree', 'add', dest, branch])
  } else {
    await git(repoPath, ['worktree', 'add', '-b', branch, dest, fromRef || 'HEAD'])
  }

  const list = parseWorktreeList(await git(repoPath, ['worktree', 'list', '--porcelain']))
  return (
    list.find((w) => w.path === dest) ?? {
      path: dest,
      branch,
      head: null,
      isMain: false,
      locked: false
    }
  )
}

export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  await git(repoPath, ['worktree', 'remove', worktreePath])
}
