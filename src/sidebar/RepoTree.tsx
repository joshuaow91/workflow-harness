import { useEffect, useMemo, useState } from 'react'
import type { BranchInfo, DevService, DevStackEntry, Repo, Worktree } from '@shared/types'
import { launchClaude } from '../lib/launchClaude'
import { settingsStore, useSettings } from '../lib/settingsStore'
import { Icon } from '../components/Icon'
import { Tooltip } from '../components/Tooltip'
import { BranchModal } from './BranchModal'
import { DevStackLogsModal } from './DevStackLogsModal'
import { SideSection } from './SideSection'
import { useRepos } from './useRepos'
import { useDevStack } from './useDevStack'
import { useFlatSessions } from './useFlatSessions'

function openClaude(cwd: string, label: string): void {
  launchClaude({ cwd, label })
}

function WorktreeRow({
  repo,
  wt,
  live,
  onChanged,
  service,
  active,
  onLogs
}: {
  repo: Repo
  wt: Worktree
  live: boolean
  onChanged: () => void
  /** This repo's dev-stack config, if one is defined. */
  service?: DevService
  /** This repo's currently-running stack, if any (may be a different worktree). */
  active?: DevStackEntry
  onLogs: () => void
}) {
  const label = wt.branch ?? `(detached ${wt.head?.slice(0, 7) ?? ''})`
  const activeHere = !!active && active.cwd === wt.path

  const activateStack = (e: React.MouseEvent): void => {
    e.stopPropagation()
    void window.api.devstack.activate(repo.name, wt.path)
  }
  const stopStack = (e: React.MouseEvent): void => {
    e.stopPropagation()
    void window.api.devstack.stop(repo.name)
  }
  const openBrowser = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (service?.browserUrl) void window.api.system.openExternal(service.browserUrl)
  }

  const remove = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!window.confirm(`Remove worktree?\n\n${wt.path}`)) return
    try {
      await window.api.worktree.remove(repo.path, wt.path)
      onChanged()
    } catch (err) {
      // Plain remove refuses a dirty/locked worktree — offer to force.
      const msg = (err as Error).message
      const dirty = /not empty|contains modified|locked|use --force|is dirty/i.test(msg)
      if (
        dirty &&
        window.confirm(
          `This worktree can't be removed cleanly:\n\n${msg.trim()}\n\nForce-remove it? Uncommitted changes here will be discarded.`
        )
      ) {
        try {
          await window.api.worktree.remove(repo.path, wt.path, true)
          onChanged()
          return
        } catch (err2) {
          window.alert(`Force-remove failed:\n${(err2 as Error).message}`)
          return
        }
      }
      window.alert(`Could not remove worktree:\n${msg}`)
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
        <Tooltip tip="The repo's primary checkout (not the main/master branch)">
          <span className="wt-tag">primary</span>
        </Tooltip>
      )}
      {live && (
        <Tooltip tip="A Claude session is running here">
          <span className="wt-live" />
        </Tooltip>
      )}
      {service &&
        (activeHere ? (
          <div className="wt-stack" onClick={(e) => e.stopPropagation()}>
            <span className="wt-stack-badge">● :{service.port}</span>
            <Tooltip tip={`Open ${service.browserUrl} in your browser`}>
              <button className="term-act" onClick={openBrowser}>
                ↗
              </button>
            </Tooltip>
            <Tooltip tip="View dev-stack logs">
              <button
                className="term-act"
                onClick={(e) => {
                  e.stopPropagation()
                  onLogs()
                }}
              >
                ☰
              </button>
            </Tooltip>
            <Tooltip tip={`Stop the dev stack (frees :${service.port}; leaves the checkout)`}>
              <button className="term-act" onClick={stopStack}>
                ■
              </button>
            </Tooltip>
          </div>
        ) : (
          <Tooltip
            tip={`Run ${repo.name}'s dev stack from here on :${service.port}${
              active ? `\nStops the stack on "${active.cwd.split('/').pop()}"` : ''
            }`}
          >
            <button className="wt-stack-run" onClick={activateStack}>
              ▶ run
            </button>
          </Tooltip>
        ))}
      <div className="wt-actions">
        {!wt.isMain && (
          <Tooltip tip="Remove this worktree">
            <button className="term-act" onClick={remove}>
              <Icon name="close" size={13} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

// A local branch that isn't checked out in any worktree. It has no working
// directory, so its one action is to place it in one: `run` = check it out into
// the repo's checkout, then serve its dev stack (or just `checkout` if the repo
// has no dev-stack service). Once run, it becomes the primary worktree row.
function BranchRow({
  repo,
  branch,
  service,
  onChanged
}: {
  repo: Repo
  branch: BranchInfo
  service?: DevService
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)

  const run = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    setBusy(true)
    try {
      await window.api.branch.checkout(repo.path, branch.name) // place it in the working tree
      if (service) await window.api.devstack.activate(repo.name, repo.path) // …and serve it
      onChanged()
    } catch (err) {
      window.alert(
        `Couldn't ${service ? 'run' : 'check out'} ${branch.name}:\n${(err as Error).message}\n\nCommit or stash changes in the checkout first?`
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="wt-row branch-only"
      title={`${branch.name}\n${service ? 'Hover → run: check out & serve this branch' : 'Hover → checkout'}`}
    >
      <span className="wt-icon branch-only">
        <Icon name="branch" size={12} />
      </span>
      <span className="wt-branch">{branch.name}</span>
      {branch.upstream && (
        <Tooltip tip={`Pushed — tracks ${branch.upstream}`}>
          <span className="wt-tag">↑</span>
        </Tooltip>
      )}
      <Tooltip
        tip={
          service
            ? `Check out ${branch.name} into the repo and run its dev stack on :${service.port}`
            : `Check out ${branch.name} in the repo`
        }
      >
        <button className="wt-stack-run" disabled={busy} onClick={run}>
          {busy ? '…' : service ? '▶ run' : 'checkout'}
        </button>
      </Tooltip>
    </div>
  )
}

function RepoRow({
  repo,
  liveCwds,
  onChanged,
  service,
  active,
  dnd
}: {
  repo: Repo
  liveCwds: Set<string>
  onChanged: () => void
  service?: DevService
  active?: DevStackEntry
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
  const [showBranches, setShowBranches] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [branches, setBranches] = useState<BranchInfo[]>([])

  const extraWorktrees = repo.worktrees.filter((w) => !w.isMain).length
  const liveCount = repo.worktrees.filter((w) => liveCwds.has(w.path)).length

  // Local branches (loaded lazily on expand, no network fetch). Anything already
  // checked out in a worktree is shown as a worktree row, so exclude those; also
  // hide merged/gone branches (they live in the Branches modal for cleanup).
  const loadBranches = (): void => {
    void window.api.branch
      .status(repo.path, false)
      .then((s) => setBranches(s?.branches ?? []))
      .catch(() => setBranches([]))
  }
  useEffect(() => {
    if (open) loadBranches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, repo.path])

  const refreshAll = (): void => {
    onChanged()
    loadBranches()
  }

  const worktreeBranches = new Set(
    repo.worktrees.map((w) => w.branch).filter((b): b is string => !!b)
  )
  const branchRows = branches.filter(
    (b) => !worktreeBranches.has(b.name) && !b.merged && !b.gone
  )
  const MAX_BRANCH_ROWS = 10
  const shownBranches = branchRows.slice(0, MAX_BRANCH_ROWS)
  const moreBranches = branchRows.length - shownBranches.length

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
        <span className="repo-name" title={repo.name}>
          {repo.name}
        </span>
        {repo.currentBranch && <span className="repo-branch">{repo.currentBranch}</span>}
        {liveCount > 0 && <span className="repo-live-count">{liveCount} live</span>}
        {active && (
          <Tooltip tip={`Dev stack running on :${active.port} from ${active.cwd.split('/').pop()}`}>
            <span className="repo-stack-live">:{active.port}</span>
          </Tooltip>
        )}
        {extraWorktrees > 0 && <span className="repo-wt-count">{extraWorktrees}⎇</span>}
        <div className="repo-actions">
          <Tooltip tip="Manage branches — pull latest, check out, clean up old branches">
            <button
              className="term-act"
              onClick={(e) => {
                e.stopPropagation()
                setShowBranches(true)
              }}
            >
              <Icon name="branch" size={13} />
            </button>
          </Tooltip>
        </div>
      </div>

      {showBranches && (
        <BranchModal repoPath={repo.path} repoName={repo.name} onClose={() => setShowBranches(false)} />
      )}
      {showLogs && <DevStackLogsModal repo={repo.name} onClose={() => setShowLogs(false)} />}

      {open && (
        <div className="repo-children">
          {repo.worktrees.map((wt) => (
            <WorktreeRow
              key={wt.path}
              repo={repo}
              wt={wt}
              live={liveCwds.has(wt.path)}
              onChanged={refreshAll}
              service={service}
              active={active}
              onLogs={() => setShowLogs(true)}
            />
          ))}
          {shownBranches.length > 0 && <div className="wt-branch-sep">branches</div>}
          {shownBranches.map((b) => (
            <BranchRow
              key={b.name}
              repo={repo}
              branch={b}
              service={service}
              onChanged={refreshAll}
            />
          ))}
          {moreBranches > 0 && (
            <button className="wt-branch-more" onClick={() => setShowBranches(true)}>
              +{moreBranches} more in branch manager
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
  const settings = useSettings()
  const { serviceFor, activeFor } = useDevStack()
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
    <SideSection
      title="Repos"
      action={
        <Tooltip tip="Rescan repos">
          <button className="side-section-icon" onClick={refresh}>
            <Icon name="refresh" size={13} />
          </button>
        </Tooltip>
      }
    >
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
            service={serviceFor(repo.name)}
            active={activeFor(repo.name)}
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
    </SideSection>
  )
}
