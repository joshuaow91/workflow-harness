import { useMemo, useState } from 'react'
import type { Repo, Worktree } from '@shared/types'
import { terminalBus } from '../lib/terminalBus'
import { useRepos } from './useRepos'
import { useFlatSessions } from './useFlatSessions'

function openClaude(cwd: string, label: string): void {
  terminalBus.open({ cwd, initialCommand: 'claude', label })
}

function WorktreeRow({
  repo,
  wt,
  live,
  onChanged
}: {
  repo: Repo
  wt: Worktree
  live: boolean
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
    <div
      className="wt-row"
      onClick={() => openClaude(wt.path, `${repo.name}:${label}`)}
      title={`${wt.path}\nClick to open a claude session here`}
    >
      <span className={`wt-dot ${live ? 'live' : wt.isMain ? 'main' : 'idle'}`} />
      <span className="wt-branch">{label}</span>
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

function RepoRow({
  repo,
  liveCwds,
  onChanged
}: {
  repo: Repo
  liveCwds: Set<string>
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [branch, setBranch] = useState('')
  const [busy, setBusy] = useState(false)

  const extraWorktrees = repo.worktrees.filter((w) => !w.isMain).length
  const liveCount = repo.worktrees.filter((w) => liveCwds.has(w.path)).length

  const startAdding = (): void => {
    setBranch(`session-${extraWorktrees + 1}`)
    setAdding(true)
    setOpen(true)
  }

  // Create the worktree AND open a claude session in it — one action.
  const createAndOpen = async (): Promise<void> => {
    const name = branch.trim()
    if (!name) return
    setBusy(true)
    try {
      const wt = await window.api.worktree.add(repo.path, name)
      setAdding(false)
      setBranch('')
      onChanged()
      setOpen(true)
      openClaude(wt.path, `${repo.name}:${name}`)
    } catch (err) {
      window.alert(`Could not create worktree:\n${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="repo-block">
      <div className="repo-row" onClick={() => setOpen((v) => !v)}>
        <span className={`chev${open ? '' : ' collapsed'}`}>▼</span>
        <span className="repo-name">{repo.name}</span>
        {repo.currentBranch && <span className="repo-branch">{repo.currentBranch}</span>}
        {liveCount > 0 && <span className="repo-live-count">{liveCount} live</span>}
        {extraWorktrees > 0 && <span className="repo-wt-count">{extraWorktrees}⎇</span>}
        <div className="repo-actions">
          <button
            className="term-act"
            title="Open claude in the main checkout"
            onClick={(e) => {
              e.stopPropagation()
              openClaude(repo.path, repo.name)
            }}
          >
            ▷
          </button>
          <button
            className="term-act"
            title="New parallel session (new worktree + claude)"
            onClick={(e) => {
              e.stopPropagation()
              startAdding()
            }}
          >
            ＋
          </button>
        </div>
      </div>

      {open && (
        <div className="repo-children">
          {repo.worktrees.map((wt) => (
            <WorktreeRow
              key={wt.path}
              repo={repo}
              wt={wt}
              live={liveCwds.has(wt.path)}
              onChanged={onChanged}
            />
          ))}
          {adding ? (
            <div className="wt-add">
              <input
                autoFocus
                className="wt-input"
                placeholder="branch name"
                value={branch}
                disabled={busy}
                onChange={(e) => setBranch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createAndOpen()
                  if (e.key === 'Escape') {
                    setAdding(false)
                    setBranch('')
                  }
                }}
              />
              <button className="term-act" disabled={busy} title="Create + open" onClick={() => void createAndOpen()}>
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
          ) : (
            <button className="wt-new" onClick={startAdding}>
              ＋ new parallel session
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function RepoTree() {
  const { repos, loading, refresh } = useRepos()
  const sessions = useFlatSessions()
  const liveCwds = useMemo(
    () => new Set(sessions.filter((s) => s.live).map((s) => s.cwd)),
    [sessions]
  )

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
        repos.map((repo) => (
          <RepoRow key={repo.path} repo={repo} liveCwds={liveCwds} onChanged={refresh} />
        ))
      )}
    </>
  )
}
