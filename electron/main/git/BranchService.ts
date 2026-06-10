import { execFile } from 'child_process'
import { promisify } from 'util'
import type { BranchDeleteResult, BranchInfo, RepoBranchStatus } from '@shared/types'

const pexec = promisify(execFile)

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await pexec('git', args, { cwd, maxBuffer: 4 * 1024 * 1024 })
  return stdout.trim()
}
async function tryGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    return await git(cwd, args)
  } catch {
    return null
  }
}

async function detectDefault(repoPath: string): Promise<string> {
  // origin/HEAD points at the remote's default branch, e.g. "origin/main".
  const head = await tryGit(repoPath, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  if (head) return head.replace(/^origin\//, '')
  for (const b of ['main', 'master']) {
    if (await tryGit(repoPath, ['rev-parse', '--verify', `refs/heads/${b}`])) return b
  }
  return 'main'
}

// branch name -> secondary worktree path (main checkout excluded).
async function worktreeBranchMap(repoPath: string): Promise<Map<string, string>> {
  const porcelain = (await tryGit(repoPath, ['worktree', 'list', '--porcelain'])) ?? ''
  const map = new Map<string, string>()
  let path = ''
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) path = line.slice(9).trim()
    else if (line.startsWith('branch refs/heads/')) {
      const name = line.slice('branch refs/heads/'.length).trim()
      if (path && path !== repoPath) map.set(name, path)
    }
  }
  return map
}

export async function branchStatus(repoPath: string, fetch = true): Promise<RepoBranchStatus> {
  if (fetch) await tryGit(repoPath, ['fetch', '--prune', '--quiet'])

  const def = await detectDefault(repoPath)
  const current = (await tryGit(repoPath, ['symbolic-ref', '--short', 'HEAD'])) ?? '(detached)'

  // Branch -> secondary-worktree path (the main checkout, path === repoPath, is
  // excluded — that branch is just "current", not a removable worktree).
  const wtBranches = await worktreeBranchMap(repoPath)

  // Branches merged into the remote's default tip.
  const mergedRaw =
    (await tryGit(repoPath, ['branch', '--merged', `origin/${def}`, '--format=%(refname:short)'])) ?? ''
  const merged = new Set(mergedRaw.split('\n').map((s) => s.trim()).filter(Boolean))

  const raw = await git(repoPath, [
    'for-each-ref',
    '--format=%(refname:short)\t%(upstream:track)\t%(upstream:short)',
    'refs/heads'
  ])
  const branches: BranchInfo[] = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, track, upstream] = line.split('\t')
      return {
        name,
        current: name === current,
        isDefault: name === def,
        gone: track === '[gone]',
        merged: merged.has(name) && name !== def,
        upstream: upstream || null,
        worktree: wtBranches.has(name),
        worktreePath: wtBranches.get(name)
      }
    })

  const behind = Number((await tryGit(repoPath, ['rev-list', '--count', `${def}..origin/${def}`])) ?? '0') || 0

  return { repo: repoPath.split('/').pop() ?? repoPath, path: repoPath, defaultBranch: def, currentBranch: current, defaultBehind: behind, branches }
}

// Fast-forward the local default branch from origin. If it's the checked-out
// branch we pull; otherwise update the ref in place without switching.
export async function pullDefault(repoPath: string): Promise<void> {
  const def = await detectDefault(repoPath)
  const current = await tryGit(repoPath, ['symbolic-ref', '--short', 'HEAD'])
  await tryGit(repoPath, ['fetch', '--prune', '--quiet'])
  if (current === def) {
    await git(repoPath, ['pull', '--ff-only'])
  } else {
    // Fails (non-fast-forward) only if local default diverged — surfaced to the user.
    await git(repoPath, ['fetch', 'origin', `${def}:${def}`])
  }
}

// Switch the main checkout to a branch (e.g. back to main/master). Fails on a
// dirty tree or if the branch is checked out in another worktree — surfaced.
export async function checkoutBranch(repoPath: string, branch: string): Promise<void> {
  await git(repoPath, ['checkout', branch])
}

export async function deleteBranches(
  repoPath: string,
  names: string[],
  force = true
): Promise<BranchDeleteResult> {
  const wt = await worktreeBranchMap(repoPath)
  const deleted: string[] = []
  const failed: { name: string; error: string }[] = []
  for (const name of names) {
    try {
      // A branch checked out in a worktree can't be deleted until the worktree is
      // removed — do that first (force discards its uncommitted changes).
      const wtPath = wt.get(name)
      if (wtPath) await git(repoPath, ['worktree', 'remove', '--force', wtPath])
      await git(repoPath, ['branch', force ? '-D' : '-d', name])
      deleted.push(name)
    } catch (e) {
      failed.push({ name, error: ((e as { stderr?: string }).stderr ?? (e as Error).message).trim() })
    }
  }
  await tryGit(repoPath, ['worktree', 'prune'])
  return { deleted, failed }
}
