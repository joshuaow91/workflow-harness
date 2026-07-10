import { useMemo, useState } from 'react'
import type { DevService, DevStackEntry, Repo, Worktree } from '@shared/types'
import { launchClaude } from '../lib/launchClaude'
import { settingsStore, useSettings } from '../lib/settingsStore'
import { Icon } from '../components/Icon'
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
        <span className="wt-tag" title="The repo's primary checkout (not the main/master branch)">
          primary
        </span>
      )}
      {live && <span className="wt-live" title="claude running here" />}
      {service &&
        (activeHere ? (
          <div className="wt-stack" onClick={(e) => e.stopPropagation()}>
            <span className="wt-stack-badge" title={`Dev stack running here on :${service.port}`}>
              ● :{service.port}
            </span>
            <button className="term-act" title={`Open ${service.browserUrl}`} onClick={openBrowser}>
              ↗
            </button>
            <button
              className="term-act"
              title="View dev-stack logs"
              onClick={(e) => {
                e.stopPropagation()
                onLogs()
              }}
            >
              ☰
            </button>
            <button className="term-act" title="Stop dev stack" onClick={stopStack}>
              ■
            </button>
          </div>
        ) : (
          <button
            className="wt-stack-run"
            title={`Run ${repo.name}'s dev stack from here on :${service.port}${
              active ? ` — stops the stack on "${active.cwd.split('/').pop()}"` : ''
            }`}
            onClick={activateStack}
          >
            ▶ run
          </button>
        ))}
      <div className="wt-actions">
        {!wt.isMain && (
          <button className="term-act" title="Remove worktree" onClick={remove}>
            <Icon name="close" size={13} />
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

  const extraWorktrees = repo.worktrees.filter((w) => !w.isMain).length
  const liveCount = repo.worktrees.filter((w) => liveCwds.has(w.path)).length

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
          <span
            className="repo-stack-live"
            title={`Dev stack running on :${active.port} from ${active.cwd.split('/').pop()}`}
          >
            :{active.port}
          </span>
        )}
        {extraWorktrees > 0 && <span className="repo-wt-count">{extraWorktrees}⎇</span>}
        <div className="repo-actions">
          <button
            className="term-act"
            title="Manage branches — pull latest, check out, clean up old branches"
            onClick={(e) => {
              e.stopPropagation()
              setShowBranches(true)
            }}
          >
            <Icon name="branch" size={13} />
          </button>
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
              onChanged={onChanged}
              service={service}
              active={active}
              onLogs={() => setShowLogs(true)}
            />
          ))}
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
        <button className="side-section-icon" onClick={refresh} title="Rescan repos">
          <Icon name="refresh" size={13} />
        </button>
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
