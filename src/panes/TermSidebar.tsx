import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import type { SessionAgent, SessionRef, SessionTask } from '@shared/types'
import { useFlatSessions } from '../sidebar/useFlatSessions'
import { useRepos } from '../sidebar/useRepos'
import { diffBus } from '../lib/diffBus'
import { PlanModal } from './PlanModal'
import { PostIssueModal } from './PostIssueModal'
import { PrRow } from './PrRow'


// Per-session-pane progress sidebar: Claude's live task plan + the PRs/issues the
// session worked on (parsed from the transcript, so multiple repos are covered).
export function TermSidebar({ sessionId, terminalId }: { sessionId?: string; terminalId?: string }) {
  const [tasks, setTasks] = useState<SessionTask[]>([])
  const [refs, setRefs] = useState<SessionRef[]>([])
  const [agents, setAgents] = useState<SessionAgent[]>([])
  const [openAgent, setOpenAgent] = useState<string | null>(null)
  const [hasPlan, setHasPlan] = useState(false)
  const [modal, setModal] = useState(false)
  const [postOpen, setPostOpen] = useState(false)
  const [showMoreIssues, setShowMoreIssues] = useState(false)

  const sessions = useFlatSessions()
  const { repos } = useRepos()

  // The pane's sessionId is frozen at launch, but `/clear` starts a NEW session id
  // inside the same pty. Resolve the session actually running in this terminal (by
  // walking the pty's process tree in main) so we always show the current
  // conversation, not the pre-clear one. Falls back to the launch id.
  const [resolvedSid, setResolvedSid] = useState<string | null>(null)
  useEffect(() => {
    if (!terminalId) {
      setResolvedSid(null)
      return
    }
    let active = true
    const resolve = (): void => {
      void window.api.terminal.sessionFor(terminalId).then((s) => active && setResolvedSid(s))
    }
    resolve()
    const iv = setInterval(resolve, 4000) // catch /clear promptly
    return () => {
      active = false
      clearInterval(iv)
    }
  }, [terminalId])
  const sid = resolvedSid ?? sessionId

  // Resolve the (effective) session's cwd/title (for "View diff").
  const session = sessions.find((s) => s.sessionId === sid)

  useEffect(() => {
    if (!sid) {
      setTasks([])
      setRefs([])
      setHasPlan(false)
      return
    }
    // A fresh (post-clear) session: drop the old session's data immediately so
    // nothing stale lingers between the id change and the first reload.
    setTasks([])
    setRefs([])
    setHasPlan(false)
    let active = true
    const loadTasks = (): void => {
      void window.api.claude.sessionTasks(sid).then((t) => active && setTasks(t))
    }
    const loadPlan = (): void => {
      void window.api.claude.sessionPlan(sid).then((p) => active && setHasPlan(!!p.trim()))
    }
    const loadAgents = (): void => {
      void window.api.claude.sessionAgents?.(sid).then((a) => active && setAgents(a))
    }
    const loadLinks = (): void => {
      void window.api.claude.sessionLinks(sid).then((parsed) => {
        if (!active) return
        setRefs(parsed)
        if (parsed.length) void window.api.github.enrichLinks(parsed).then((e) => active && setRefs(e))
      })
    }
    loadTasks()
    loadPlan()
    loadLinks()
    loadAgents()
    // Tasks/plan are local-transcript reads (cheap). Links re-parse the
    // transcript (local) + enrichLinks (API, but cached ~10 min in main), so a
    // 60s poll surfaces a newly-created PR quickly without real extra API cost.
    const t0 = setInterval(loadAgents, 5000)
    const t1 = setInterval(loadTasks, 5000)
    const t2 = setInterval(loadLinks, 60000)
    const t3 = setInterval(loadPlan, 30000)
    return () => {
      active = false
      clearInterval(t0)
      clearInterval(t1)
      clearInterval(t2)
      clearInterval(t3)
    }
  }, [sid])

  const done = tasks.filter((t) => t.status === 'completed').length
  const prs = refs.filter((r) => r.kind === 'pr')
  const allIssues = refs.filter((r) => r.kind === 'issue')
  // The issue this session is about: the one anchored from the launch/first
  // message, else the first referenced. Other issues (sub-issues a plan surveyed)
  // are collapsed behind a "+N more" toggle so the section isn't noisy.
  const issue = allIssues.find((r) => r.primary) ?? allIssues[0]
  const otherIssues = allIssues.filter((r) => r !== issue)

  // Repos the session actually changed (cross-repo): the linked PR repos mapped
  // to local checkouts; fall back to issue repos, then the session cwd.
  const repoFor = (nwo: string): { name: string; path: string } | undefined => {
    const r = repos.find((x) => x.nameWithOwner === nwo)
    return r ? { name: r.name, path: r.path } : undefined
  }
  const candidateRefs = prs.length ? prs : allIssues
  const mapped = Array.from(
    new Map(
      candidateRefs
        .map((r) => repoFor(r.repo))
        .filter((r): r is { name: string; path: string } => !!r)
        .map((r) => [r.path, r])
    ).values()
  )
  const diffRepos =
    mapped.length > 0
      ? mapped
      : session?.cwd
        ? [{ name: session.cwd.split('/').filter(Boolean).pop() ?? 'repo', path: session.cwd }]
        : []

  return (
    <div className="term-sidebar">
      {diffRepos.length > 0 && (
        <button
          className="term-sb-diff"
          title="Review this session's changes with hunk in the Diff tab"
          onClick={() => diffBus.openTab(diffRepos[0]?.path || session?.cwd || '')}
        >
          <Icon name="diff" size={13} /> Review diff
          {diffRepos.length > 1 ? ` (${diffRepos[0]?.name})` : ''}
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
              <Icon name="expand" size={13} />
            </button>
          )}
        </div>
        {!sid ? (
          <div className="term-sb-empty">Not a resumed session — no linked plan.</div>
        ) : tasks.length === 0 ? (
          hasPlan ? (
            <button className="term-sb-viewplan" onClick={() => setModal(true)}>
              No task list — view the full plan <Icon name="expand" size={13} />
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

      {agents.length > 0 && (
        <div className="term-sb-section">
          <div className="term-sb-title">
            Agents
            <span className="term-sb-count">
              {agents.filter((a) => a.status === 'running').length || agents.length}
            </span>
          </div>
          <div className="sb-agents">
            {agents.map((a) => (
              <div key={a.id} className="sb-agent">
                <button
                  className="sb-agent-head"
                  onClick={() => setOpenAgent(openAgent === a.id ? null : a.id)}
                  title={a.result ? 'Show what this agent returned' : 'Still running'}
                >
                  <span className="agent-dot" data-state={a.status === 'running' ? 'working' : 'done'} />
                  <span className="sb-agent-desc">{a.description || a.type}</span>
                  <span className="sb-agent-type">{a.type}</span>
                </button>
                {openAgent === a.id && a.result && <pre className="sb-agent-out">{a.result}</pre>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="term-sb-section">
        <div className="term-sb-title">GitHub</div>
        {refs.length === 0 ? (
          <div className="term-sb-empty">No linked PRs or issues found.</div>
        ) : (
          <div className="term-sb-reflist">
            {prs.map((r) => (
              <PrRow key={r.url} link={r} terminalId={terminalId} />
            ))}
            {issue && <PrRow key={issue.url} link={issue} terminalId={terminalId} />}
            {otherIssues.length > 0 && (
              <button className="term-sb-more" onClick={() => setShowMoreIssues((v) => !v)}>
                {showMoreIssues ? 'Hide referenced issues' : `+${otherIssues.length} more referenced`}
              </button>
            )}
            {showMoreIssues &&
              otherIssues.map((r) => <PrRow key={r.url} link={r} terminalId={terminalId} />)}
          </div>
        )}
        {issue && sid && (
          <button className="tbtn post-update-btn" onClick={() => setPostOpen(true)}>
            ✎ Post update to #{issue.number}
          </button>
        )}
      </div>

      {modal && <PlanModal sessionId={sid} onClose={() => setModal(false)} />}
      {postOpen && issue && sid && (
        <PostIssueModal
          repo={issue.repo}
          number={issue.number}
          sessionId={sid}
          onClose={() => setPostOpen(false)}
        />
      )}
    </div>
  )
}
