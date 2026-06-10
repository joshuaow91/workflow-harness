import { type ReactNode } from 'react'
import { Icon } from '../components/Icon'

export function openExternal(url: string): void {
  if (url) void window.api.system.openExternal(url)
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
        <Icon name="refresh" size={14} /> Refresh
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
