import { useState } from 'react'
import type { GhIssueDetail } from '@shared/types'
import { useAsync } from '../lib/useAsync'
import { Icon } from '../components/Icon'

function labelStyle(hex: string): React.CSSProperties {
  const c = (hex || '888888').replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return { backgroundColor: `#${c}`, color: lum > 0.6 ? '#1b1b1f' : '#ffffff' }
}

function Section({
  title,
  editing,
  onToggle,
  children
}: {
  title: string
  editing?: boolean
  onToggle?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="issue-side-sec">
      <div className="issue-side-head">
        <h4>{title}</h4>
        {onToggle && (
          <button className={`issue-side-gear${editing ? ' on' : ''}`} onClick={onToggle} title="Edit">
            <Icon name="settings" size={13} />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

export function IssueSidebar({
  repo,
  number,
  detail,
  onChanged
}: {
  repo: string
  number: number
  detail: GhIssueDetail
  onChanged: () => void
}) {
  const [edit, setEdit] = useState<'labels' | 'assignees' | 'milestone' | null>(null)
  const [busy, setBusy] = useState(false)

  const labels = useAsync(
    () => (edit === 'labels' ? window.api.github.repoLabels(repo) : Promise.resolve(null)),
    [edit, repo]
  )
  const assignees = useAsync(
    () => (edit === 'assignees' ? window.api.github.repoAssignees(repo) : Promise.resolve(null)),
    [edit, repo]
  )
  const milestones = useAsync(
    () => (edit === 'milestone' ? window.api.github.repoMilestones(repo) : Promise.resolve(null)),
    [edit, repo]
  )

  const apply = async (patch: Parameters<typeof window.api.github.editIssue>[2]): Promise<void> => {
    setBusy(true)
    try {
      await window.api.github.editIssue(repo, number, patch)
      onChanged()
    } catch (e) {
      window.alert(`Could not update:\n${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const hasLabel = (n: string): boolean => detail.labels.some((l) => l.name === n)
  const hasAssignee = (n: string): boolean => detail.assignees.includes(n)
  const toggle = (k: typeof edit): void => setEdit((e) => (e === k ? null : k))

  return (
    <aside className="issue-side">
      <Section title="Assignees" editing={edit === 'assignees'} onToggle={() => toggle('assignees')}>
        {edit === 'assignees' ? (
          <div className="side-edit-list">
            {!assignees.data && <span className="issue-side-muted">Loading…</span>}
            {(assignees.data ?? []).map((login) => (
              <label key={login} className="side-edit-row">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={hasAssignee(login)}
                  onChange={() =>
                    apply(hasAssignee(login) ? { removeAssignees: [login] } : { addAssignees: [login] })
                  }
                />
                {login}
              </label>
            ))}
          </div>
        ) : detail.assignees.length ? (
          detail.assignees.join(', ')
        ) : (
          <span className="issue-side-muted">No one assigned</span>
        )}
      </Section>

      <Section title="Labels" editing={edit === 'labels'} onToggle={() => toggle('labels')}>
        {edit === 'labels' ? (
          <div className="side-edit-list">
            {!labels.data && <span className="issue-side-muted">Loading…</span>}
            {(labels.data ?? []).map((l) => (
              <label key={l.name} className="side-edit-row">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={hasLabel(l.name)}
                  onChange={() =>
                    apply(hasLabel(l.name) ? { removeLabels: [l.name] } : { addLabels: [l.name] })
                  }
                />
                <span className="issue-label" style={labelStyle(l.color)}>
                  {l.name}
                </span>
              </label>
            ))}
          </div>
        ) : detail.labels.length ? (
          <div className="issue-side-labels">
            {detail.labels.map((l) => (
              <span key={l.name} className="issue-label" style={labelStyle(l.color)}>
                {l.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="issue-side-muted">None yet</span>
        )}
      </Section>

      <Section title="Milestone" editing={edit === 'milestone'} onToggle={() => toggle('milestone')}>
        {edit === 'milestone' ? (
          <div className="side-edit-list">
            <label className="side-edit-row">
              <input
                type="radio"
                disabled={busy}
                checked={!detail.milestone}
                onChange={() => apply({ milestone: null }).then(() => setEdit(null))}
              />
              No milestone
            </label>
            {!milestones.data && <span className="issue-side-muted">Loading…</span>}
            {(milestones.data ?? []).map((m) => (
              <label key={m} className="side-edit-row">
                <input
                  type="radio"
                  disabled={busy}
                  checked={detail.milestone === m}
                  onChange={() => apply({ milestone: m }).then(() => setEdit(null))}
                />
                {m}
              </label>
            ))}
          </div>
        ) : (
          detail.milestone ?? <span className="issue-side-muted">No milestone</span>
        )}
      </Section>

      <Section title="Project status">
        {detail.boardStatus ?? <span className="issue-side-muted">Not on a board</span>}
      </Section>
    </aside>
  )
}
