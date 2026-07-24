import { useEffect, useRef, useState } from 'react'
import type { ClaudeSession } from '@shared/types'
import { relativeTime } from '../lib/time'
import { launchClaude } from '../lib/launchClaude'
import { paletteBus } from '../lib/paletteBus'
import { sessionAlerts, useSessionAlerts } from '../lib/sessionAlerts'
import { settingsStore, useSettings } from '../lib/settingsStore'
import { ContextMenu } from '../components/ContextMenu'
import { Icon } from '../components/Icon'
import { RepoTree } from './RepoTree'
import { useClaudeProjects } from './useClaudeProjects'
import { usePaneSessions } from '../lib/openSessions'

// The sidebar answers one question: where do I go next? It lists the sessions you
// actually have open, ranked by what wants you — not the ~70 transcripts in
// ~/.claude, which are history you search (⌘K) rather than a list you keep on
// screen. Hierarchy does the work: a blocked session looks urgent, idle recedes.

type State = 'blocked' | 'working' | 'done' | 'idle'
const RANK: Record<State, number> = { blocked: 0, working: 1, done: 2, idle: 3 }

interface MenuState {
  sessionId: string
  slug: string
  title: string
  pid: number | null
  x: number
  y: number
}

export function Sidebar() {
  const { projects, loading } = useClaudeProjects()
  const paneStatus = usePaneSessions()
  const settings = useSettings()
  const titles = settings?.sessionTitles ?? {}
  const needsResp = useSessionAlerts()

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  // Resizable, width persisted. The shell reads --sidebar-w for its grid column.
  const [width, setWidth] = useState(
    () => Number(localStorage.getItem('harness:sidebarW')) || 264
  )
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', `${width}px`)
    localStorage.setItem('harness:sidebarW', String(width))
  }, [width])
  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    const onMove = (ev: MouseEvent): void =>
      setWidth(Math.min(Math.max(ev.clientX, 200), Math.round(window.innerWidth * 0.5)))
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const titleOf = (s: ClaudeSession): string => titles[s.sessionId] ?? s.title
  const working = (st?: string): boolean => st === 'busy' || st === 'running' || st === 'working'

  // Notify when a session starts waiting or finishes a turn.
  const prevStatus = useRef<Record<string, string>>({})
  useEffect(() => {
    const added: string[] = []
    for (const p of projects)
      for (const s of p.sessions) {
        const cur = s.live?.status ?? 'dormant'
        const prev = prevStatus.current[s.sessionId]
        if (cur === 'waiting' || (working(prev) && cur === 'idle')) {
          if (sessionAlerts.tryAdd(s.sessionId)) added.push(titleOf(s))
        } else if (working(cur)) sessionAlerts.reset(s.sessionId)
        prevStatus.current[s.sessionId] = cur
      }
    if (added.length && settings?.notifySessionResponse !== false)
      added.forEach((t) => void window.api.system.notify('Session needs a response', t))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects])

  // One real state per session, from claude's own status plus pty activity.
  const stateOf = (s: ClaudeSession): State => {
    if (s.live?.status === 'waiting') return 'blocked'
    if (working(s.live?.status) || paneStatus.get(s.sessionId)?.busy) return 'working'
    if (needsResp.has(s.sessionId)) return 'done'
    return 'idle'
  }

  const lastActive = (s: ClaudeSession): number =>
    Math.max(paneStatus.get(s.sessionId)?.lastActive ?? 0, Date.parse(s.lastActivityAt || '') || 0)

  // "Open" = a live process or a pane. Everything else is history.
  const open = projects
    .flatMap((p) => p.sessions.map((s) => ({ s, slug: p.slug })))
    .filter(({ s }) => s.live || paneStatus.has(s.sessionId))
    .map((e) => ({ ...e, state: stateOf(e.s) }))
    .sort((a, b) => RANK[a.state] - RANK[b.state] || lastActive(b.s) - lastActive(a.s))

  const count = (st: State): number => open.filter((o) => o.state === st).length
  const waiting = count('blocked')
  const busy = count('working')
  const finished = count('done')

  const killSession = (sessionId: string): void => {
    void window.api.claude.killSession(sessionId)
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
    if (
      !window.confirm(`Delete this session transcript?\n\n“${m.title}”\n\nThis removes it from ~/.claude.`)
    )
      return
    void window.api.claude.deleteSession(m.slug, m.sessionId)
  }
  const toggleCheck = (id: string): void =>
    setChecked((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const checkedLive = open.filter((o) => checked.has(o.s.sessionId) && o.s.live)
  const bulkKill = (): void => {
    checkedLive.forEach((o) => killSession(o.s.sessionId))
    setChecked(new Set())
    setSelectMode(false)
  }
  const bulkDelete = (): void => {
    const sel = open.filter((o) => checked.has(o.s.sessionId))
    if (!sel.length) return
    if (!window.confirm(`Delete ${sel.length} session transcript${sel.length > 1 ? 's' : ''}?`)) return
    sel.forEach((o) => void window.api.claude.deleteSession(o.slug, o.s.sessionId))
    setChecked(new Set())
    setSelectMode(false)
  }

  return (
    <div className="sidebar sb">
      <div className="sb-resize" onMouseDown={startResize} title="Drag to resize" />
      {/* Only states that exist get named — never "0 waiting". */}
      {(waiting > 0 || busy > 0 || finished > 0) && (
        <div className="sb-status">
          {waiting > 0 && (
            <span className="sb-stat blocked">
              <i className="sb-dot pulse" />
              <b>{waiting}</b> waiting
            </span>
          )}
          {busy > 0 && (
            <span className="sb-stat working">
              <i className="sb-dot" />
              <b>{busy}</b> working
            </span>
          )}
          {finished > 0 && (
            <span className="sb-stat done">
              <i className="sb-dot" />
              <b>{finished}</b> done
            </span>
          )}
        </div>
      )}

      <div className="sb-sec">
        <div className="sb-sec-h">
          Open
          <span>
            {open.length} pane{open.length === 1 ? '' : 's'}
          </span>
          {open.length > 0 && (
            <button
              className="sb-sel-toggle"
              onClick={() => {
                setSelectMode((v) => !v)
                setChecked(new Set())
              }}
            >
              {selectMode ? 'Done' : 'Select'}
            </button>
          )}
        </div>

        {selectMode && (
          <div className="sb-bulk">
            <span>{checked.size} selected</span>
            <button disabled={!checkedLive.length} onClick={bulkKill}>
              Kill{checkedLive.length ? ` (${checkedLive.length})` : ''}
            </button>
            <button disabled={!checked.size} onClick={bulkDelete}>
              Delete
            </button>
          </div>
        )}

        {loading && open.length === 0 ? (
          <div className="sb-empty">Loading…</div>
        ) : open.length === 0 ? (
          <div className="sb-empty">Nothing open. Start a session from a repo below.</div>
        ) : (
          open.map(({ s, slug, state }) => (
            <div
              key={s.sessionId}
              className={`sb-row ${state}${checked.has(s.sessionId) ? ' checked' : ''}`}
              onClick={() => {
                if (selectMode) return toggleCheck(s.sessionId)
                sessionAlerts.clear(s.sessionId)
                launchClaude({ cwd: s.cwd, resumeId: s.sessionId, label: titleOf(s) })
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
              title={`${titleOf(s)}\n${s.cwd}`}
            >
              <div className="sb-main">
              {selectMode ? (
                <input
                  type="checkbox"
                  className="sb-check"
                  checked={checked.has(s.sessionId)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleCheck(s.sessionId)}
                />
              ) : (
                <i className="sb-dot" />
              )}

              {editing === s.sessionId ? (
                <input
                  autoFocus
                  className="sb-rename"
                  value={draft}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => submitRename(s.sessionId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitRename(s.sessionId)
                    if (e.key === 'Escape') setEditing(null)
                  }}
                />
              ) : (
                <span className="sb-name">{titleOf(s)}</span>
              )}

              {state === 'idle' && <span className="sb-tag">idle</span>}

              <span className="sb-when">
                {relativeTime(
                  paneStatus.has(s.sessionId)
                    ? new Date(paneStatus.get(s.sessionId)!.lastActive).toISOString()
                    : s.lastActivityAt
                )}
              </span>

              {s.live && !selectMode && (
                <button
                  className="sb-kill"
                  title="Kill this session (frees the process; the conversation stays resumable)"
                  onClick={(e) => {
                    e.stopPropagation()
                    killSession(s.sessionId)
                  }}
                >
                  <Icon name="power" size={12} />
                </button>
              )}
              </div>

              {/* A blocked row states what it's waiting on, so the sidebar can
                  often answer the question instead of just pointing at it. */}
              {state === 'blocked' && <span className="sb-sub">Waiting for your answer</span>}
            </div>
          ))
        )}
      </div>

      {/* History is searched, not listed. */}
      <button className="sb-launch" onClick={() => paletteBus.open()}>
        Find a session…
        <kbd>⌘K</kbd>
      </button>

      <RepoTree />

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: 'Rename',
              onClick: () => {
                setDraft(menu.title)
                setEditing(menu.sessionId)
              }
            },
            ...(menu.pid != null
              ? [{ label: 'Kill', onClick: () => killSession(menu.sessionId) }]
              : []),
            { label: 'Delete', danger: true, onClick: () => deleteSession(menu) }
          ]}
        />
      )}
    </div>
  )
}
