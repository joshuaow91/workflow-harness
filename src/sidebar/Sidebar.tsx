import { useState } from 'react'
import type { ClaudeSession } from '@shared/types'
import { relativeTime } from '../lib/time'
import { launchClaude } from '../lib/launchClaude'
import { settingsStore, useSettings } from '../lib/settingsStore'
import { ContextMenu } from '../components/ContextMenu'
import { RepoTree } from './RepoTree'
import { SideSection } from './SideSection'
import { useClaudeProjects } from './useClaudeProjects'

interface MenuState {
  sessionId: string
  slug: string
  title: string
  x: number
  y: number
}

function SessionRow({
  session,
  displayTitle,
  selected,
  editing,
  draft,
  onDraft,
  onSubmitRename,
  onCancelRename,
  onSelect,
  onContextMenu
}: {
  session: ClaudeSession
  displayTitle: string
  selected: boolean
  editing: boolean
  draft: string
  onDraft: (v: string) => void
  onSubmitRename: () => void
  onCancelRename: () => void
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const live = session.live
  const dotClass = live ? (live.status === 'busy' ? 'busy' : 'idle') : 'dormant'
  const branch = session.gitBranch && session.gitBranch !== 'HEAD' ? session.gitBranch : null

  const resume = (): void => {
    onSelect()
    launchClaude({ cwd: session.cwd, resumeId: session.sessionId, label: displayTitle })
  }

  return (
    <div
      className={`session-row${selected ? ' selected' : ''}`}
      onClick={editing ? undefined : resume}
      onContextMenu={onContextMenu}
      title={`${displayTitle}\n${session.cwd}\nClick to resume · right-click to rename/delete`}
    >
      <span className={`session-dot ${dotClass}`} />
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
          <span>{relativeTime(session.lastActivityAt)}</span>
          {live && <span className="session-live">{live.status}</span>}
        </span>
      </span>
    </div>
  )
}

export function Sidebar() {
  const { projects, loading } = useClaudeProjects()
  const settings = useSettings()
  const titles = settings?.sessionTitles ?? {}
  const [selected, setSelected] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpanded = (slug: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })

  const titleOf = (s: ClaudeSession): string => titles[s.sessionId] ?? s.title

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

  return (
    <div className="sidebar">
      {loading && projects.length === 0 ? (
        <div className="side-empty" style={{ padding: '14px' }}>
          Loading projects…
        </div>
      ) : projects.length === 0 ? (
        <SideSection title="Projects">
          <div className="side-empty">No Claude sessions found in ~/.claude/projects.</div>
        </SideSection>
      ) : (
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
            {(expanded.has(project.slug)
              ? project.sessions
              : project.sessions.slice(0, 10)
            ).map((s) => (
              <SessionRow
                key={s.sessionId}
                session={s}
                displayTitle={titleOf(s)}
                selected={selected === s.sessionId}
                editing={editing === s.sessionId}
                draft={draft}
                onDraft={setDraft}
                onSubmitRename={() => submitRename(s.sessionId)}
                onCancelRename={() => setEditing(null)}
                onSelect={() => setSelected(s.sessionId)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu({
                    sessionId: s.sessionId,
                    slug: project.slug,
                    title: titleOf(s),
                    x: e.clientX,
                    y: e.clientY
                  })
                }}
              />
            ))}
            {project.sessions.length > 10 && (
              <button className="side-more" onClick={() => toggleExpanded(project.slug)}>
                {expanded.has(project.slug)
                  ? 'Show less'
                  : `Show ${project.sessions.length - 10} more`}
              </button>
            )}
          </SideSection>
        ))
      )}

      <SideSection title="Repos">
        <RepoTree />
      </SideSection>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Rename', onClick: () => startRename(menu) },
            { label: 'Delete', danger: true, onClick: () => deleteSession(menu) }
          ]}
        />
      )}
    </div>
  )
}
