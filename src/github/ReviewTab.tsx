import { useState } from 'react'
import type { GhPullRequest } from '@shared/types'
import { useAsync } from '../lib/useAsync'
import { WebFrame } from '../panes/WebFrame'
import { GhHeader, GhState } from './GhShared'
import { PrRow } from './PrRow'

export function ReviewTab() {
  const { data, error, loading, reload } = useAsync(() => window.api.github.reviewPRs(), [])
  const prs = data ?? []
  const [open, setOpen] = useState<GhPullRequest | null>(null)

  if (open) {
    return (
      <div className="gh-tab">
        <div className="gh-embed">
          <WebFrame
            src={open.url}
            editableAddress={false}
            leftSlot={
              <button className="tbtn" onClick={() => setOpen(null)}>
                ← list
              </button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="gh-tab">
      <GhHeader onRefresh={reload} count={prs.length}>
        <span className="gh-heading">PRs awaiting your review</span>
      </GhHeader>
      <div className="gh-list">
        <GhState
          loading={loading}
          error={error}
          empty={prs.length === 0}
          emptyText="Nothing awaiting your review. 🎉"
        />
        {prs.map((pr) => (
          <PrRow key={`${pr.repo}#${pr.number}`} pr={pr} showRepo onOpen={setOpen} />
        ))}
      </div>
    </div>
  )
}
