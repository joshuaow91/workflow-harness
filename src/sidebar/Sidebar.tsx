import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClaudeSession } from '@shared/types'
import { relativeTime } from '../lib/time'
import { launchClaude } from '../lib/launchClaude'
import { sessionAlerts, useSessionAlerts } from '../lib/sessionAlerts'
import { settingsStore, useSettings } from '../lib/settingsStore'
import { ContextMenu } from '../components/ContextMenu'
import { Icon } from '../components/Icon'
import { RepoTree } from './RepoTree'
import { SideSection } from './SideSection'
import { useClaudeProjects } from './useClaudeProjects'
import { usePaneSessions, type PaneStatus } from '../lib/openSessions'

interface MenuState {
  sessionId: string
  slug: string
  title: string
  /** Live process pid, if the session is running (enables "Kill"). */
  pid: number | null
  x: number
  y: number
}

function SessionRow({
  session,
  displayTitle,
  selected,
  needsResponse,
  pane,
  editing,
  draft,
  onDraft,
  onSubmitRename,
  onCancelRename,
  onSelect,
  onContextMenu,
  onKill,
  selectMode,
  checked,
  onToggleCheck
}: {
  session: ClaudeSession
  displayTitle: string
  selected: boolean
  needsResponse: boolean
  pane: PaneStatus | undefined
  editing: boolean
  draft: string
  onDraft: (v: string) => void
  onSubmitRename: () => void
  onCancelRename: () => void
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onKill: () => void
  selectMode: boolean
  checked: boolean
  onToggleCheck: () => void
}) {
  const live = session.live
  // Status precedence: claude's own sessions file (when present), else pane
  // output activity (resumed-in-pty sessions don't write a file), else dormant.
  const status = live ? live.status : pane ? (pane.busy ? 'busy' : 'idle') : null
  const dotClass = status === 'busy' ? 'busy' : status ? 'idle' : 'dormant'
  // Prefer the live pty output time for an open pane; else the transcript time.
  const lastActiveIso = pane ? new Date(pane.lastActive).toISOString() : session.lastActivityAt
  const branch = session.gitBranch && session.gitBranch !== 'HEAD' ? session.gitBranch : null

  const resume = (): void => {
    onSelect()
    launchClaude({ cwd: session.cwd, resumeId: session.sessionId, label: displayTitle })
  }

  return (
    <div
      className={`session-row${selected ? ' selected' : ''}${needsResponse ? ' needs-response' : ''}${
        selectMode && checked ? ' checked' : ''
      }`}
      onClick={editing ? undefined : selectMode ? onToggleCheck : resume}
      onContextMenu={onContextMenu}
      title={
        selectMode
          ? displayTitle
          : `${displayTitle}\n${session.cwd}\nClick to resume · right-click to rename/delete`
      }
    >
      {selectMode ? (
        <input
          type="checkbox"
          className="session-check"
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggleCheck}
        />
      ) : (
        <span className={`session-dot ${dotClass}`} />
      )}
      <span className="session-body">
        {editing ? (
          <input
            autoFocus
            className="session-rename"
            value={draft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onDraft(e.target.value)}
            onBlur={onSubmitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmitRename()
              if (e.key === 'Escape') onCancelRename()
            }}
          />
        ) : (
          <span className="session-title">{displayTitle}</span>
        )}
        <span className="session-meta">
          {branch && <span className="session-branch">⎇ {branch}</span>}
          <span>{relativeTime(lastActiveIso)}</span>
          {status && <span className="session-live">{status}</span>}
        </span>
      </span>
      {live && !selectMode && (
        <button
          className="session-kill"
          title={`Kill this ${live.status} session (frees the process; conversation stays resumable)`}
          onClick={(e) => {
            e.stopPropagation()
            onKill()
          }}
        >
          <Icon name="power" size={13} />
        </button>
      )}
    </div>
  )
}

export function Sidebar() {
  const { projects, loading } = useClaudeProjects()
  const paneStatus = usePaneSessions()
  const settings = useSettings()
  const titles = settings?.sessionTitles ?? {}
  const [selected, setSelected] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  // Detect when a session finishes a turn (busy -> idle) = needs a response.
  const needsResp = useSessionAlerts()
  const prevStatus = useRef<Record<string, string>>({})
  const working = (st?: string): boolean => st === 'busy' || st === 'running' || st === 'working'
  useEffect(() => {
    const added: { id: string; title: string }[] = []
    for (const p of projects)
      for (const s of p.sessions) {
        const cur = s.live?.status ?? 'dormant'
        const prev = prevStatus.current[s.sessionId]
        // "waiting" = a permission prompt / awaiting input (fires on first sight);
        // busy -> idle = finished a turn.
        const needs = cur === 'waiting' || (working(prev) && cur === 'idle')
        if (needs) {
          // tryAdd respects acknowledgement: once you click into a waiting pane,
          // it won't re-blink for the same episode (until the session works again).
          if (sessionAlerts.tryAdd(s.sessionId)) added.push({ id: s.sessionId, title: titleOf(s) })
        } else if (working(cur)) {
          sessionAlerts.reset(s.sessionId) // back to working → forget the episode
        }
        prevStatus.current[s.sessionId] = cur
      }
    if (added.length && settings?.notifySessionResponse !== false) {
      added.forEach((a) => void window.api.system.notify('Session needs a response', a.title))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects])
  const clearAlert = (id: string): void => sessionAlerts.clear(id)

  const toggleExpanded = (slug: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })

  const titleOf = (s: ClaudeSession): string => titles[s.sessionId] ?? s.title

  // Float the most-recently-active session to the top. Uses live pty activity for
  // open panes (which may be ahead of the on-disk transcript) as well as the
  // transcript time, so an actively-responding session rises immediately.
  const liveKey = (s: ClaudeSession): number => {
    const p = paneStatus.get(s.sessionId)
    const t = s.lastActivityAt ? Date.parse(s.lastActivityAt) : 0
    return Math.max(p?.lastActive ?? 0, Number.isNaN(t) ? 0 : t)
  }
  // Rank by what wants your attention, then by recency. Sorting purely by time
  // buried the session that was actually waiting on you under idle history.
  const priority = (s: ClaudeSession): number => {
    if (needsResp.has(s.sessionId)) return 3 // waiting on you
    const st = s.live?.status ?? (paneStatus.get(s.sessionId)?.busy ? 'busy' : null)
    if (working(st ?? undefined)) return 2 // running
    return st ? 1 : 0 // open but idle, then dormant history
  }
  const sortByActivity = (arr: ClaudeSession[]): ClaudeSession[] =>
    [...arr].sort((a, b) => priority(b) - priority(a) || liveKey(b) - liveKey(a))

  // Type to filter across every session — title, branch, or path.
  const matches = (s: ClaudeSession): boolean => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return `${titleOf(s)} ${s.gitBranch ?? ''} ${s.cwd}`.toLowerCase().includes(q)
  }

  const needsCount = projects.reduce(
    (n, p) => n + p.sessions.filter((s) => needsResp.has(s.sessionId)).length,
    0
  )

  // Most of ~/.claude is history: dozens of transcripts, a handful actually live.
  // Show the live ones flat and keep the rest behind an explicit ask, so the
  // sidebar is a worklist rather than an archive.
  const totalSessions = projects.reduce((n, p) => n + p.sessions.length, 0)
  const activeList = sortByActivity(
    projects
      .flatMap((p) => p.sessions)
      .filter((s) => s.live || paneStatus.has(s.sessionId) || needsResp.has(s.sessionId))
  )
  const slugOf = (s: ClaudeSession): string =>
    projects.find((p) => p.sessions.some((x) => x.sessionId === s.sessionId))?.slug ?? ''

  const startRename = (m: MenuState): void => {
    setDraft(m.title)
    setEditing(m.sessionId)
  }

  const submitRename = (sessionId: string): void => {
    const t = draft.trim()
    const next = { ...titles }
    if (t) next[sessionId] = t
    else delete next[sessionId]
    void settingsStore.update({ sessionTitles: next })
    setEditing(null)
  }

  const deleteSession = (m: MenuState): void => {
    if (!window.confirm(`Delete this session transcript?\n\n“${m.title}”\n\nThis removes it from ~/.claude.`))
      return
    void window.api.claude.deleteSession(m.slug, m.sessionId)
    if (titles[m.sessionId]) {
      const next = { ...titles }
      delete next[m.sessionId]
      void settingsStore.update({ sessionTitles: next })
    }
  }

  // Close a live session — terminates all its processes (some sessions span
  // several panes); the conversation stays on disk and is resumable.
  const killSession = (sessionId: string): void => {
    void window.api.claude.killSession(sessionId)
  }

  // ---- Multi-select bulk actions ----
  // Flat lookup so a checked sessionId resolves to its slug (for delete) + liveness.
  const sessionIndex = useMemo(() => {
    const m = new Map<string, { slug: string; live: boolean }>()
    for (const p of projects) for (const s of p.sessions) m.set(s.sessionId, { slug: p.slug, live: !!s.live })
    return m
  }, [projects])

  const toggleCheck = (id: string): void =>
    setChecked((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const exitSelect = (): void => {
    setSelectMode(false)
    setChecked(new Set())
  }

  const liveChecked = useMemo(
    () => [...checked].filter((id) => sessionIndex.get(id)?.live),
    [checked, sessionIndex]
  )

  const bulkKill = (): void => {
    for (const id of liveChecked) killSession(id)
    setChecked(new Set())
  }

  const bulkDelete = (): void => {
    const ids = [...checked]
    if (ids.length === 0) return
    if (
      !window.confirm(
        `Delete ${ids.length} session transcript${ids.length > 1 ? 's' : ''}?\n\nThis removes ${
          ids.length > 1 ? 'them' : 'it'
        } from ~/.claude.`
      )
    )
      return
    const nextTitles = { ...titles }
    for (const id of ids) {
      const info = sessionIndex.get(id)
      if (info) void window.api.claude.deleteSession(info.slug, id)
      if (nextTitles[id]) delete nextTitles[id]
    }
    void settingsStore.update({ sessionTitles: nextTitles })
    exitSelect()
  }

  const renderRow = (s: ClaudeSession, slug: string): React.ReactElement => (
    <SessionRow
      key={s.sessionId}
      session={s}
      displayTitle={titleOf(s)}
      selected={selected === s.sessionId}
      needsResponse={needsResp.has(s.sessionId)}
      pane={paneStatus.get(s.sessionId)}
      editing={editing === s.sessionId}
      draft={draft}
      onDraft={setDraft}
      onSubmitRename={() => submitRename(s.sessionId)}
      onCancelRename={() => setEditing(null)}
      onSelect={() => {
        setSelected(s.sessionId)
        clearAlert(s.sessionId)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({
          sessionId: s.sessionId,
          slug,
          title: titleOf(s),
          pid: s.live?.pid ?? null,
          x: e.clientX,
          y: e.clientY
        })
      }}
      onKill={() => {
        if (s.live) killSession(s.sessionId)
      }}
      selectMode={selectMode}
      checked={checked.has(s.sessionId)}
      onToggleCheck={() => toggleCheck(s.sessionId)}
    />
  )

  return (
    <div className="sidebar">
      {/* The one thing worth seeing first: who's waiting on you. */}
      {needsCount > 0 && (
        <div className="side-needs" title="These are sorted to the top of the list">
          <span className="agent-dot" data-state="blocked" />
          {needsCount} session{needsCount > 1 ? 's' : ''} need you
        </div>
      )}

      {projects.length > 0 && (
        <div className="side-search">
          <input
            className="side-search-input"
            placeholder="Search sessions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
          {query && (
            <button className="side-search-clear" onClick={() => setQuery('')} title="Clear">
              ×
            </button>
          )}
        </div>
      )}

      {projects.length > 0 && (
        <div className="side-selectbar">
          {selectMode ? (
            <>
              <span className="side-sel-count">{checked.size} selected</span>
              <button
                className="side-sel-btn"
                disabled={liveChecked.length === 0}
                onClick={bulkKill}
                title="Kill the selected live sessions (frees processes; conversations stay resumable)"
              >
                Kill{liveChecked.length ? ` (${liveChecked.length})` : ''}
              </button>
              <button
                className="side-sel-btn danger"
                disabled={checked.size === 0}
                onClick={bulkDelete}
                title="Delete the selected transcripts from ~/.claude"
              >
                Delete
              </button>
              <button className="side-sel-btn" onClick={exitSelect}>
                Done
              </button>
            </>
          ) : (
            <button
              className="side-sel-toggle"
              onClick={() => setSelectMode(true)}
              title="Select multiple sessions to bulk kill or delete"
            >
              ☑ Select
            </button>
          )}
        </div>
      )}
      {/* Active work first: the few sessions that are live or waiting on you. */}
      {!query.trim() && activeList.length > 0 && (
        <SideSection title="Active" count={activeList.length} defaultOpen>
          {activeList.map((s) => renderRow(s, slugOf(s)))}
        </SideSection>
      )}

      {loading && projects.length === 0 ? (
        <div className="side-empty" style={{ padding: '14px' }}>
          Loading projects…
        </div>
      ) : projects.length === 0 ? (
        <SideSection title="Projects">
          <div className="side-empty">No Claude sessions found in ~/.claude/projects.</div>
        </SideSection>
      ) : !showAll && !query.trim() ? null : (
        projects.map((project) => (
          <SideSection
            key={project.slug}
            title={project.name}
            count={project.sessions.length}
            defaultOpen={projects.length <= 3}
          >
            <button
              className="side-action"
              onClick={() => launchClaude({ cwd: project.path, label: project.name })}
              title={`Start a new claude session in ${project.path}`}
            >
              ＋ new claude session
            </button>
            {(() => {
              const hits = sortByActivity(project.sessions.filter(matches))
              // While searching, show every match — a capped list hides the thing
              // you searched for.
              return query.trim() || expanded.has(project.slug) ? hits : hits.slice(0, 10)
            })().map((s) => renderRow(s, project.slug))}
            {!query.trim() && project.sessions.length > 10 && (
              <button className="side-more" onClick={() => toggleExpanded(project.slug)}>
                {expanded.has(project.slug)
                  ? 'Show less'
                  : `Show ${project.sessions.length - 10} more`}
              </button>
            )}
          </SideSection>
        ))
      )}

      {/* ~/.claude is mostly archive — keep it one click away, not on screen. */}
      {!query.trim() && totalSessions > activeList.length && (
        <button className="side-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Hide history' : `All sessions (${totalSessions})`}
        </button>
      )}

      <RepoTree />

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Rename', onClick: () => startRename(menu) },
            ...(menu.pid != null
              ? [{ label: 'Kill session', onClick: () => killSession(menu.sessionId) }]
              : []),
            { label: 'Delete', danger: true, onClick: () => deleteSession(menu) }
          ]}
        />
      )}
    </div>
  )
}
