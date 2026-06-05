import { useEffect, useState } from 'react'
import type { SessionRef, SessionTask } from '@shared/types'
import { PlanModal } from './PlanModal'

// Map the team's Projects v2 board statuses to badge colors.
function boardBadge(status: string): { label: string; cls: string } {
  const s = status.toLowerCase()
  if (s.includes('review')) return { label: status, cls: 'review' }
  if (s.includes('progress')) return { label: status, cls: 'progress' }
  if (s.includes('ready')) return { label: status, cls: 'ready' }
  if (s.includes('release')) return { label: status, cls: 'release' }
  if (s.includes('closed')) return { label: status, cls: 'closed' }
  return { label: status, cls: 'muted' } // "No Status" and anything unmapped
}

function badge(r: SessionRef): { label: string; cls: string } | null {
  // Prefer the project board status when present (open/closed/merged is coarse).
  if (r.boardStatus) return boardBadge(r.boardStatus)
  const s = r.state?.toUpperCase()
  if (!s) return null
  if (s === 'MERGED') return { label: 'merged', cls: 'merged' }
  if (s === 'CLOSED') return { label: 'closed', cls: 'closed' }
  // OPEN
  if (r.kind === 'issue') return { label: 'open', cls: 'ok' }
  if (r.isDraft) return { label: 'draft', cls: 'muted' }
  if (r.reviewDecision === 'APPROVED') return { label: 'approved', cls: 'ok' }
  if (r.reviewDecision === 'CHANGES_REQUESTED') return { label: 'changes', cls: 'closed' }
  if (r.reviewDecision === 'REVIEW_REQUIRED') return { label: 'review', cls: 'pending' }
  return { label: 'open', cls: 'ok' }
}

function RefButton({ r }: { r: SessionRef }) {
  const b = badge(r)
  return (
    <button className="term-sb-link" onClick={() => void window.api.system.openExternal(r.url)}>
      <div className="term-sb-link-row">
        <span className="term-sb-refnum">
          {r.kind === 'pr' ? 'PR' : 'Issue'} #{r.number}
        </span>
        {b && <span className={`gh-badge ${b.cls}`}>{b.label}</span>}
      </div>
      <span className="term-sb-repo" title={r.repo}>
        {r.repo.split('/')[1] ?? r.repo}
      </span>
    </button>
  )
}

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
    const loadTasks = (): void => {
      void window.api.claude.sessionTasks(sessionId).then((t) => active && setTasks(t))
    }
    const loadLinks = (): void => {
      void window.api.claude.sessionLinks(sessionId).then((parsed) => {
        if (!active) return
        setRefs(parsed)
        if (parsed.length) void window.api.github.enrichLinks(parsed).then((e) => active && setRefs(e))
      })
    }
    loadTasks()
    loadLinks()
    const t1 = setInterval(loadTasks, 5000)
    const t2 = setInterval(loadLinks, 20000)
    return () => {
      active = false
      clearInterval(t1)
      clearInterval(t2)
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
          <div className="term-sb-reflist">
            {prs.map((r) => (
              <RefButton key={r.url} r={r} />
            ))}
            {issues.map((r) => (
              <RefButton key={r.url} r={r} />
            ))}
          </div>
        )}
      </div>

      {modal && <PlanModal sessionId={sessionId} onClose={() => setModal(false)} />}
    </div>
  )
}
