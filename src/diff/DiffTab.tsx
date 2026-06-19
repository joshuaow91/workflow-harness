import { useEffect, useMemo, useState } from 'react'
import type { BranchInfo } from '@shared/types'
import { useRepos } from '../sidebar/useRepos'
import { useAsync } from '../lib/useAsync'
import { Dropdown } from '../components/Dropdown'
import { diffBus } from '../lib/diffBus'
import { DiffPanel } from './DiffPanel'

export function DiffTab() {
  const { repos } = useRepos()

  // ---- Repo selection ----
  const [repoPath, setRepoPath] = useState<string | null>(null)
  useEffect(() => {
    if (!repoPath && repos.length) setRepoPath(repos[0].path)
  }, [repoPath, repos])

  const repoOptions = useMemo(() => {
    const opts = repos.map((r) => ({ value: r.path, label: r.name }))
    // An externally-requested path that isn't a known repo: show it anyway.
    if (repoPath && !repos.some((r) => r.path === repoPath))
      opts.unshift({ value: repoPath, label: repoPath.split('/').slice(-1)[0] })
    return opts
  }, [repos, repoPath])

  // ---- Branches for the selected repo (local refs, no network fetch) ----
  const status = useAsync(
    () => (repoPath ? window.api.branch.status(repoPath, false) : Promise.resolve(null)),
    [repoPath]
  )
  const branches: BranchInfo[] = status.data?.branches ?? []

  const [branch, setBranch] = useState<string | null>(null)
  // Default to the repo's current branch when the branch list (re)loads.
  useEffect(() => {
    const data = status.data
    if (!data) return
    setBranch((prev) =>
      prev && data.branches.some((b) => b.name === prev) ? prev : data.currentBranch
    )
  }, [status.data])

  // External "Open in Changes tab" requests pass a repo/worktree path. Select the
  // owning repo, then (once branches load) the branch whose checkout is that path.
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  useEffect(
    () =>
      diffBus.onTab((p) => {
        const owner = repos.find((r) => r.path === p || r.worktrees?.some((w) => w.path === p))
        setRepoPath(owner ? owner.path : p)
        setPendingPath(p)
      }),
    [repos]
  )
  useEffect(() => {
    if (!pendingPath || !status.data) return
    const match = status.data.branches.find((b) => b.worktreePath === pendingPath)
    setBranch(match ? match.name : status.data.currentBranch)
    setPendingPath(null)
  }, [pendingPath, status.data])

  const branchOptions = useMemo(
    () =>
      branches.map((b) => ({
        value: b.name,
        label: b.current ? `${b.name} · current` : b.worktree ? `${b.name} · worktree` : b.name
      })),
    [branches]
  )

  // ---- Resolve (diff path, ref) from the selected branch ----
  //  current branch  -> repo working copy (HEAD; Uncommitted + vs-base both work)
  //  worktree branch -> that worktree's working copy (HEAD; same toggles)
  //  other branch    -> repo path + base...<branch> (committed diff only)
  const selected = branches.find((b) => b.name === branch)
  const diffPath = selected?.worktreePath && !selected.current ? selected.worktreePath : repoPath
  const diffRef =
    selected && !selected.current && !selected.worktreePath ? selected.name : undefined

  return (
    <div className="gh-tab">
      {diffPath ? (
        <DiffPanel
          key={`${diffPath}::${diffRef ?? 'HEAD'}`}
          path={diffPath}
          diffRef={diffRef}
          headerLeft={
            <>
              <Dropdown
                value={repoPath ?? ''}
                options={repoOptions}
                onChange={(v) => {
                  setRepoPath(v)
                  setBranch(null) // reset to the new repo's current branch
                }}
                searchable
                minWidth={180}
                placeholder="repo…"
              />
              <Dropdown
                value={branch ?? ''}
                options={branchOptions}
                onChange={setBranch}
                searchable
                minWidth={200}
                placeholder={status.loading ? 'loading…' : 'branch…'}
              />
            </>
          }
        />
      ) : (
        <div className="gh-state">No repos found.</div>
      )}
    </div>
  )
}
