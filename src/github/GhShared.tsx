import { useEffect, type ReactNode } from 'react'
import type { GhLabel } from '@shared/types'
import { useRepos } from '../sidebar/useRepos'
import { githubStore, useSelectedRepo } from './githubStore'

export function openExternal(url: string): void {
  if (url) void window.api.system.openExternal(url)
}

/** Dropdown of repos (those with a GitHub remote), bound to the shared store. */
export function RepoPicker() {
  const { repos } = useRepos()
  const selected = useSelectedRepo()
  const options = repos.filter((r) => r.nameWithOwner)

  useEffect(() => {
    if (!selected && options.length > 0) githubStore.set(options[0].nameWithOwner as string)
  }, [selected, options])

  return (
    <select
      className="gh-select"
      value={selected ?? ''}
      onChange={(e) => githubStore.set(e.target.value)}
    >
      {options.length === 0 && <option value="">No repos</option>}
      {options.map((r) => (
        <option key={r.path} value={r.nameWithOwner as string}>
          {r.nameWithOwner}
        </option>
      ))}
    </select>
  )
}

export function GhHeader({
  children,
  onRefresh,
  count
}: {
  children?: ReactNode
  onRefresh: () => void
  count?: number
}) {
  return (
    <div className="gh-header">
      {children}
      {count !== undefined && <span className="gh-count">{count}</span>}
      <button className="tbtn" style={{ marginLeft: 'auto' }} onClick={onRefresh}>
        ↻ Refresh
      </button>
    </div>
  )
}

export function ChecksBadge({ state }: { state: string | null }) {
  if (!state) return null
  const map: Record<string, { cls: string; label: string }> = {
    SUCCESS: { cls: 'ok', label: '✓ checks' },
    FAILURE: { cls: 'fail', label: '✕ checks' },
    PENDING: { cls: 'pending', label: '● checks' }
  }
  const m = map[state]
  if (!m) return null
  return <span className={`gh-badge ${m.cls}`}>{m.label}</span>
}

export function ReviewBadge({ decision }: { decision: string | null }) {
  if (!decision) return null
  const map: Record<string, { cls: string; label: string }> = {
    APPROVED: { cls: 'ok', label: 'approved' },
    CHANGES_REQUESTED: { cls: 'fail', label: 'changes' },
    REVIEW_REQUIRED: { cls: 'pending', label: 'review req' }
  }
  const m = map[decision]
  if (!m) return null
  return <span className={`gh-badge ${m.cls}`}>{m.label}</span>
}

export function LabelChips({ labels }: { labels: GhLabel[] }) {
  return (
    <>
      {labels.slice(0, 4).map((l) => (
        <span
          key={l.name}
          className="gh-label"
          style={{ borderColor: `#${l.color}`, color: `#${l.color}` }}
        >
          {l.name}
        </span>
      ))}
    </>
  )
}

export function GhState({
  loading,
  error,
  empty,
  emptyText
}: {
  loading: boolean
  error: string | null
  empty: boolean
  emptyText: string
}) {
  if (loading) return <div className="gh-state">Loading…</div>
  if (error) return <div className="gh-state gh-error">{error}</div>
  if (empty) return <div className="gh-state">{emptyText}</div>
  return null
}
