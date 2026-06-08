import { useEffect, useState } from 'react'
import type { SessionRef, SessionTask } from '@shared/types'
import { diffBus } from '../lib/diffBus'
import { useFlatSessions } from '../sidebar/useFlatSessions'
import { PlanModal } from './PlanModal'
import { PostIssueModal } from './PostIssueModal'
import { PrRow } from './PrRow'


// Per-session-pane progress sidebar: Claude's live task plan + the PRs/issues the
// session worked on (parsed from the transcript, so multiple repos are covered).
export function TermSidebar({ sessionId, terminalId }: { sessionId?: string; terminalId?: string }) {
  const [tasks, setTasks] = useState<SessionTask[]>([])
  const [refs, setRefs] = useState<SessionRef[]>([])
  const [hasPlan, setHasPlan] = useState(false)
  const [modal, setModal] = useState(false)
  const [postOpen, setPostOpen] = useState(false)

  // Resolve the session's cwd/title (for "View diff") from the flat session list.
  const sessions = useFlatSessions()
  const session = sessions.find((s) => s.sessionId === sessionId)

  useEffect(() => {
    if (!sessionId) {
      setTasks([])
      setRefs([])
      setHasPlan(false)
      return
    }
    let active = true
    const loadTasks = (): void => {
      void window.api.claude.sessionTasks(sessionId).then((t) => active && setTasks(t))
    }
    const loadPlan = (): void => {
      void window.api.claude.sessionPlan(sessionId).then((p) => active && setHasPlan(!!p.trim()))
    }
    const loadLinks = (): void => {
      void window.api.claude.sessionLinks(sessionId).then((parsed) => {
        if (!active) return
        setRefs(parsed)
        if (parsed.length) void window.api.github.enrichLinks(parsed).then((e) => active && setRefs(e))
      })
    }
    loadTasks()
    loadPlan()
    loadLinks()
    // Tasks/plan are local-transcript reads (cheap). Links re-parse the
    // transcript (local) + enrichLinks (API, but cached ~10 min in main), so a
    // 60s poll surfaces a newly-created PR quickly without real extra API cost.
    const t1 = setInterval(loadTasks, 5000)
    const t2 = setInterval(loadLinks, 60000)
    const t3 = setInterval(loadPlan, 30000)
    return () => {
      active = false
      clearInterval(t1)
      clearInterval(t2)
      clearInterval(t3)
    }
  }, [sessionId])

  const done = tasks.filter((t) => t.status === 'completed').length
  const prs = refs.filter((r) => r.kind === 'pr')
  const issues = refs.filter((r) => r.kind === 'issue')
  const issue = issues[0] // the issue this session is about (first referenced)

  return (
    <div className="term-sidebar">
      {session?.cwd && (
        <button
          className="term-sb-diff"
          onClick={() => diffBus.openModal(session.cwd, session.title || 'Session')}
        >
          ⧉ View diff
        </button>
      )}
      <div className="term-sb-section">
        <div className="term-sb-title">
          Plan
          {tasks.length > 0 && (
            <span className="term-sb-count">
              {done}/{tasks.length}
            </span>
          )}
          {(tasks.length > 0 || hasPlan) && (
            <button className="term-sb-expand" title="Open plan" onClick={() => setModal(true)}>
              ⤢
            </button>
          )}
        </div>
        {!sessionId ? (
          <div className="term-sb-empty">Not a resumed session — no linked plan.</div>
        ) : tasks.length === 0 ? (
          hasPlan ? (
            <button className="term-sb-viewplan" onClick={() => setModal(true)}>
              No task list — view the full plan ⤢
            </button>
          ) : (
            <div className="term-sb-empty">No tasks or plan yet.</div>
          )
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
          <div className="term-sb-reflist">
            {prs.map((r) => (
              <PrRow key={r.url} link={r} terminalId={terminalId} />
            ))}
            {issues.map((r) => (
              <PrRow key={r.url} link={r} terminalId={terminalId} />
            ))}
          </div>
        )}
        {issue && sessionId && (
          <button className="tbtn post-update-btn" onClick={() => setPostOpen(true)}>
            ✎ Post update to #{issue.number}
          </button>
        )}
      </div>

      {modal && <PlanModal sessionId={sessionId} onClose={() => setModal(false)} />}
      {postOpen && issue && sessionId && (
        <PostIssueModal
          repo={issue.repo}
          number={issue.number}
          sessionId={sessionId}
          onClose={() => setPostOpen(false)}
        />
      )}
    </div>
  )
}
