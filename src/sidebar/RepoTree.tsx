import { useState } from 'react'
import type { Repo, Worktree } from '@shared/types'
import { terminalBus } from '../lib/terminalBus'
import { useRepos } from './useRepos'

function openClaude(cwd: string, label: string): void {
  terminalBus.open({ cwd, initialCommand: 'claude', label })
}

function WorktreeRow({
  repo,
  wt,
  onChanged
}: {
  repo: Repo
  wt: Worktree
  onChanged: () => void
}) {
  const label = wt.branch ?? `(detached ${wt.head?.slice(0, 7) ?? ''})`

  const remove = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!window.confirm(`Remove worktree?\n\n${wt.path}`)) return
    try {
      await window.api.worktree.remove(repo.path, wt.path)
      onChanged()
    } catch (err) {
      window.alert(`Could not remove worktree:\n${(err as Error).message}`)
    }
  }

  return (
    <div className="wt-row" onClick={() => openClaude(wt.path, `${repo.name}:${label}`)} title={wt.path}>
      <span className="wt-branch">
        {wt.isMain ? '● ' : '⎇ '}
        {label}
      </span>
      <div className="wt-actions">
        <button
          className="term-act"
          title="Open claude here"
          onClick={(e) => {
            e.stopPropagation()
            openClaude(wt.path, `${repo.name}:${label}`)
          }}
        >
          ▷
        </button>
        {!wt.isMain && (
          <button className="term-act" title="Remove worktree" onClick={remove}>
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

function RepoRow({ repo, onChanged }: { repo: Repo; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [branch, setBranch] = useState('')
  const [busy, setBusy] = useState(false)

  const createWorktree = async (): Promise<void> => {
    const name = branch.trim()
    if (!name) return
    setBusy(true)
    try {
      await window.api.worktree.add(repo.path, name)
      setAdding(false)
      setBranch('')
      onChanged()
      setOpen(true)
    } catch (err) {
      window.alert(`Could not create worktree:\n${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const extraWorktrees = repo.worktrees.filter((w) => !w.isMain).length

  return (
    <div className="repo-block">
      <div className="repo-row" onClick={() => setOpen((v) => !v)}>
        <span className={`chev${open ? '' : ' collapsed'}`}>▼</span>
        <span className="repo-name">{repo.name}</span>
        {repo.currentBranch && <span className="repo-branch">{repo.currentBranch}</span>}
        {extraWorktrees > 0 && <span className="repo-wt-count">{extraWorktrees}⎇</span>}
        <div className="repo-actions">
          <button
            className="term-act"
            title="Open claude in repo root"
            onClick={(e) => {
              e.stopPropagation()
              openClaude(repo.path, repo.name)
            }}
          >
            ▷
          </button>
          <button
            className="term-act"
            title="New worktree"
            onClick={(e) => {
              e.stopPropagation()
              setAdding(true)
              setOpen(true)
            }}
          >
            ＋
          </button>
        </div>
      </div>

      {open && (
        <div className="repo-children">
          {repo.worktrees.map((wt) => (
            <WorktreeRow key={wt.path} repo={repo} wt={wt} onChanged={onChanged} />
          ))}
          {adding && (
            <div className="wt-add">
              <input
                autoFocus
                className="wt-input"
                placeholder="new-branch-name"
                value={branch}
                disabled={busy}
                onChange={(e) => setBranch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createWorktree()
                  if (e.key === 'Escape') {
                    setAdding(false)
                    setBranch('')
                  }
                }}
              />
              <button className="term-act" disabled={busy} onClick={() => void createWorktree()}>
                ✓
              </button>
              <button
                className="term-act"
                onClick={() => {
                  setAdding(false)
                  setBranch('')
                }}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function RepoTree() {
  const { repos, loading, refresh } = useRepos()

  return (
    <>
      <button className="side-action" onClick={refresh} title="Rescan repos">
        ↻ refresh repos
      </button>
      {loading ? (
        <div className="side-empty">Scanning repos…</div>
      ) : repos.length === 0 ? (
        <div className="side-empty">No git repos found under ~/Documents/Code.</div>
      ) : (
        repos.map((repo) => <RepoRow key={repo.path} repo={repo} onChanged={refresh} />)
      )}
    </>
  )
}
