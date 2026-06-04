import { useState } from 'react'
import type { ClaudeSession } from '@shared/types'
import { relativeTime } from '../lib/time'
import { terminalBus } from '../lib/terminalBus'
import { SideSection } from './SideSection'
import { useClaudeProjects } from './useClaudeProjects'

function SessionRow({
  session,
  selected,
  onSelect
}: {
  session: ClaudeSession
  selected: boolean
  onSelect: () => void
}) {
  const live = session.live
  const dotClass = live ? (live.status === 'busy' ? 'busy' : 'idle') : 'dormant'
  const branch = session.gitBranch && session.gitBranch !== 'HEAD' ? session.gitBranch : null

  const resume = (): void => {
    onSelect()
    terminalBus.open({
      cwd: session.cwd,
      initialCommand: `claude --resume ${session.sessionId}`,
      label: session.title
    })
  }

  return (
    <div
      className={`session-row${selected ? ' selected' : ''}`}
      onClick={resume}
      title={`${session.title}\n${session.cwd}\nClick to resume with claude --resume`}
    >
      <span className={`session-dot ${dotClass}`} />
      <span className="session-body">
        <span className="session-title">{session.title}</span>
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
  const [selected, setSelected] = useState<string | null>(null)

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
              onClick={() =>
                terminalBus.open({
                  cwd: project.path,
                  initialCommand: 'claude',
                  label: project.name
                })
              }
              title={`Start a new claude session in ${project.path}`}
            >
              ＋ new claude session
            </button>
            {project.sessions.map((s) => (
              <SessionRow
                key={s.sessionId}
                session={s}
                selected={selected === s.sessionId}
                onSelect={() => setSelected(s.sessionId)}
              />
            ))}
          </SideSection>
        ))
      )}

      <SideSection title="Repos">
        <div className="side-empty">Repos &amp; worktrees appear here (step 4).</div>
      </SideSection>
    </div>
  )
}
