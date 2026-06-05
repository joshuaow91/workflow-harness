import { useEffect, useState } from 'react'
import type { SessionRef, SessionTask } from '@shared/types'
import { PlanModal } from './PlanModal'

// Per-session-pane progress sidebar: Claude's live task plan + the PRs/issues the
// session worked on (parsed from the transcript, so multiple repos are covered).
export function TermSidebar({ sessionId }: { sessionId?: string }) {
  const [tasks, setTasks] = useState<SessionTask[]>([])
  const [refs, setRefs] = useState<SessionRef[]>([])
  const [modal, setModal] = useState(false)

  useEffect(() => {
    if (!sessionId) {
      setTasks([])
      setRefs([])
      return
    }
    let active = true
    const load = (): void => {
      void window.api.claude.sessionTasks(sessionId).then((t) => active && setTasks(t))
      void window.api.claude.sessionLinks(sessionId).then((r) => active && setRefs(r))
    }
    load()
    const iv = setInterval(load, 5000)
    return () => {
      active = false
      clearInterval(iv)
    }
  }, [sessionId])

  const done = tasks.filter((t) => t.status === 'completed').length
  const prs = refs.filter((r) => r.kind === 'pr')
  const issues = refs.filter((r) => r.kind === 'issue')

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
          {tasks.length > 0 && (
            <button className="term-sb-expand" title="Open plan" onClick={() => setModal(true)}>
              ⤢
            </button>
          )}
        </div>
        {!sessionId ? (
          <div className="term-sb-empty">Not a resumed session — no linked plan.</div>
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
        {refs.length === 0 ? (
          <div className="term-sb-empty">No linked PRs or issues found.</div>
        ) : (
          <div className="term-sb-tasks">
            {prs.map((r) => (
              <button
                key={r.url}
                className="term-sb-link"
                onClick={() => void window.api.system.openExternal(r.url)}
              >
                PR #{r.number} <span className="term-sb-repo">{r.repo.split('/')[1]}</span>
              </button>
            ))}
            {issues.map((r) => (
              <button
                key={r.url}
                className="term-sb-link issue"
                onClick={() => void window.api.system.openExternal(r.url)}
              >
                Issue #{r.number} <span className="term-sb-repo">{r.repo.split('/')[1]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {modal && <PlanModal tasks={tasks} onClose={() => setModal(false)} />}
    </div>
  )
}
