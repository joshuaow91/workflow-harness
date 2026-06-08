import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SessionRef, SessionTask } from '@shared/types'

function compose(
  plan: string,
  prs: SessionRef[],
  tasks: SessionTask[],
  sections: { plan: boolean; prs: boolean; checklist: boolean }
): string {
  const parts: string[] = []
  if (sections.plan && plan.trim()) parts.push(`## Plan\n\n${plan.trim()}`)
  if (sections.prs && prs.length)
    parts.push(
      `### Pull requests\n${prs.map((p) => `- **#${p.number}** \`${p.repo.split('/')[1] ?? p.repo}\` — ${p.url}`).join('\n')}`
    )
  if (sections.checklist && tasks.length)
    parts.push(
      `### Status\n${tasks.map((t) => `- [${t.status === 'completed' ? 'x' : ' '}] ${t.subject}`).join('\n')}`
    )
  return parts.join('\n\n')
}

export function PostIssueModal({
  repo,
  number,
  sessionId,
  prs,
  tasks,
  onClose
}: {
  repo: string
  number: number
  sessionId: string
  prs: SessionRef[]
  tasks: SessionTask[]
  onClose: () => void
}) {
  const [plan, setPlan] = useState('')
  const [sections, setSections] = useState({ plan: true, prs: prs.length > 0, checklist: tasks.length > 0 })
  const [body, setBody] = useState('')
  const [edited, setEdited] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.api.claude.sessionPlan(sessionId).then(setPlan)
  }, [sessionId])

  // Recompose when the section toggles / plan change, unless the user edited.
  useEffect(() => {
    if (!edited) setBody(compose(plan, prs, tasks, sections))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, sections])

  const post = async (): Promise<void> => {
    if (!body.trim()) return
    setBusy(true)
    try {
      await window.api.github.addComment(repo, number, body.trim())
      onClose()
    } catch (e) {
      window.alert(`Could not post:\n${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const toggle = (k: keyof typeof sections): void => {
    setEdited(false)
    setSections((s) => ({ ...s, [k]: !s[k] }))
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal post-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">
            Post update to {repo} #{number}
          </span>
          <button className="term-act" style={{ marginLeft: 'auto' }} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="post-modal-body">
          <div className="post-sections">
            {(['plan', 'prs', 'checklist'] as const).map((k) => (
              <label key={k} className="settings-toggle">
                <input type="checkbox" checked={sections[k]} onChange={() => toggle(k)} />
                {k === 'plan' ? 'Plan' : k === 'prs' ? 'Pull requests' : 'Status checklist'}
              </label>
            ))}
          </div>
          <textarea
            className="post-textarea"
            value={body}
            onChange={(e) => {
              setEdited(true)
              setBody(e.target.value)
            }}
            placeholder="Comment (Markdown)…"
          />
          <div className="post-actions">
            <span className="settings-hint">Posts as a plain comment via gh. Edit freely above.</span>
            <button className="tbtn primary" disabled={busy || !body.trim()} onClick={post}>
              {busy ? 'Posting…' : 'Post comment'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
