import { useMemo, useState } from 'react'
import type { Repo, Worktree } from '@shared/types'
import { terminalBus } from '../lib/terminalBus'
import { settingsStore, useSettings } from '../lib/settingsStore'
import { Dropdown } from '../components/Dropdown'
import { Icon } from '../components/Icon'
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
      <span className="wt-icon" data-main={wt.isMain}>
        <Icon name="branch" size={12} />
      </span>
      <span className="wt-branch">{label}</span>
      {wt.isMain && (
        <span className="wt-tag" title="The repo's primary checkout (not the main/master branch)">
          primary
        </span>
      )}
      {live && <span className="wt-live" title="claude running here" />}
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
  onChanged,
  dnd
}: {
  repo: Repo
  liveCwds: Set<string>
  onChanged: () => void
  dnd: {
    dragging: boolean
    over: boolean
    onDragStart: () => void
    onDragOver: (e: React.DragEvent) => void
    onDrop: () => void
    onDragEnd: () => void
  }
}) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState<false | 'session' | 'worktree'>(false)
  const [branch, setBranch] = useState('')
  const [base, setBase] = useState('')
  const [busy, setBusy] = useState(false)

  const extraWorktrees = repo.worktrees.filter((w) => !w.isMain).length
  const liveCount = repo.worktrees.filter((w) => liveCwds.has(w.path)).length
  const fallbackBase = repo.defaultBranch ?? 'HEAD'

  const baseOptions = [
    ...(repo.defaultBranch ? [{ value: repo.defaultBranch, label: repo.defaultBranch }] : []),
    { value: 'HEAD', label: `current (${repo.currentBranch ?? 'HEAD'})` }
  ]

  const startAdding = (mode: 'session' | 'worktree'): void => {
    setBranch(`session-${extraWorktrees + 1}`)
    setBase(fallbackBase)
    setAdding(mode)
    setOpen(true)
  }

  const create = async (): Promise<void> => {
    const name = branch.trim()
    if (!name) return
    const mode = adding
    setBusy(true)
    try {
      const wt = await window.api.worktree.add(repo.path, name, base || undefined)
      setAdding(false)
      setBranch('')
      onChanged()
      setOpen(true)
      if (mode === 'session') openClaude(wt.path, `${repo.name}:${name}`)
    } catch (err) {
      window.alert(`Could not create worktree:\n${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`repo-block${dnd.dragging ? ' dragging' : ''}${dnd.over ? ' drag-over' : ''}`}
      onDragOver={dnd.onDragOver}
      onDrop={(e) => {
        e.preventDefault()
        dnd.onDrop()
      }}
    >
      <div
        className="repo-row"
        draggable
        onDragStart={dnd.onDragStart}
        onDragEnd={dnd.onDragEnd}
        onClick={() => setOpen((v) => !v)}
      >
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
            title={`New session from ${fallbackBase}`}
            onClick={(e) => {
              e.stopPropagation()
              startAdding('session')
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
            <div className="wt-addbox">
              <div className="wt-add">
                <input
                  autoFocus
                  className="wt-input"
                  placeholder="branch name"
                  value={branch}
                  disabled={busy}
                  onChange={(e) => setBranch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void create()
                    if (e.key === 'Escape') {
                      setAdding(false)
                      setBranch('')
                    }
                  }}
                />
                <button className="term-act" disabled={busy} title="Create" onClick={() => void create()}>
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
              <div className="wt-from">
                <span className="wt-from-label">
                  {adding === 'session' ? 'new session from' : 'new worktree from'}
                </span>
                <Dropdown value={base} options={baseOptions} onChange={setBase} minWidth={130} />
              </div>
            </div>
          ) : (
            <div className="wt-newrow">
              <button className="wt-new" onClick={() => startAdding('session')}>
                ＋ session from {fallbackBase}
              </button>
              <button className="wt-new" onClick={() => startAdding('worktree')}>
                ＋ worktree from {fallbackBase}
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
  const sessions = useFlatSessions()
  const settings = useSettings()
  const order = settings?.repoOrder ?? []

  const liveCwds = useMemo(
    () => new Set(sessions.filter((s) => s.live).map((s) => s.cwd)),
    [sessions]
  )

  const ordered = useMemo(() => {
    const idx = (p: string): number => {
      const i = order.indexOf(p)
      return i < 0 ? Number.MAX_SAFE_INTEGER : i
    }
    return [...repos].sort((a, b) => {
      const d = idx(a.path) - idx(b.path)
      return d !== 0 ? d : a.name.localeCompare(b.name)
    })
  }, [repos, order])

  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)

  const drop = (targetPath: string): void => {
    if (!drag || drag === targetPath) return
    const paths = ordered.map((r) => r.path)
    const from = paths.indexOf(drag)
    const to = paths.indexOf(targetPath)
    if (from < 0 || to < 0) return
    paths.splice(from, 1)
    paths.splice(to, 0, drag)
    void settingsStore.update({ repoOrder: paths })
    setDrag(null)
    setOver(null)
  }

  return (
    <>
      <button className="side-action" onClick={refresh} title="Rescan repos">
        ↻ refresh repos
      </button>
      {loading ? (
        <div className="side-empty">Scanning repos…</div>
      ) : ordered.length === 0 ? (
        <div className="side-empty">No git repos found under ~/Documents/Code.</div>
      ) : (
        ordered.map((repo) => (
          <RepoRow
            key={repo.path}
            repo={repo}
            liveCwds={liveCwds}
            onChanged={refresh}
            dnd={{
              dragging: drag === repo.path,
              over: over === repo.path && drag !== repo.path,
              onDragStart: () => setDrag(repo.path),
              onDragOver: (e) => {
                e.preventDefault()
                if (over !== repo.path) setOver(repo.path)
              },
              onDrop: () => drop(repo.path),
              onDragEnd: () => {
                setDrag(null)
                setOver(null)
              }
            }}
          />
        ))
      )}
    </>
  )
}
