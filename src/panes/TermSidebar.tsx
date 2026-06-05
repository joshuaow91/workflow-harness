import { useEffect, useState } from 'react'
import type { SessionLink, SessionTask } from '@shared/types'

// The progress sidebar for a terminal tab: Claude's task plan (live) + the
// linked GitHub PR/issue for the session's working directory.
export function TermSidebar({ sessionId, cwd }: { sessionId?: string; cwd?: string }) {
  const [tasks, setTasks] = useState<SessionTask[]>([])
  const [link, setLink] = useState<SessionLink | null>(null)

  useEffect(() => {
    if (!sessionId) {
      setTasks([])
      return
    }
    let active = true
    const load = (): void => {
      void window.api.claude.sessionTasks(sessionId).then((t) => active && setTasks(t))
    }
    load()
    const iv = setInterval(load, 4000)
    return () => {
      active = false
      clearInterval(iv)
    }
  }, [sessionId])

  useEffect(() => {
    if (!cwd) {
      setLink(null)
      return
    }
    let active = true
    void window.api.github
      .sessionLink(cwd)
      .then((l) => active && setLink(l))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [cwd])

  const done = tasks.filter((t) => t.status === 'completed').length

  return (
    <div className="term-sidebar">
      <div className="term-sb-section">
        <div className="term-sb-title">
          Plan
          {tasks.length > 0 && (
            <span className="term-sb-count">
              {done}/{tasks.length}
            </span>
          )}
        </div>
        {!sessionId ? (
          <div className="term-sb-empty">
            New session — the task list appears here once Claude makes a plan. (Resumed sessions link
            automatically.)
          </div>
        ) : tasks.length === 0 ? (
          <div className="term-sb-empty">No tasks yet.</div>
        ) : (
          <div className="term-sb-tasks">
            {tasks.map((t) => (
              <div key={t.id} className={`term-task ${t.status}`}>
                <span className="term-task-dot" />
                <span className="term-task-text">{t.subject}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="term-sb-section">
        <div className="term-sb-title">GitHub</div>
        {link?.branch && (
          <div className="term-sb-row">
            <span className="term-sb-key">⎇</span>
            <span className="term-sb-val">{link.branch}</span>
          </div>
        )}
        {link?.pr && (
          <button className="term-sb-link" onClick={() => void window.api.system.openExternal(link.pr!.url)}>
            PR #{link.pr.number} · {link.pr.state.toLowerCase()}
            {link.pr.isDraft ? ' (draft)' : ''}
          </button>
        )}
        {!link?.pr && link?.issueNumber && link.repo && (
          <button
            className="term-sb-link"
            onClick={() =>
              void window.api.system.openExternal(
                `https://github.com/${link.repo}/issues/${link.issueNumber}`
              )
            }
          >
            Issue #{link.issueNumber}
          </button>
        )}
        {link && !link.pr && !link.issueNumber && (
          <div className="term-sb-empty">No linked PR or issue.</div>
        )}
      </div>
    </div>
  )
}
