import type { GhPullRequest } from '@shared/types'
import { relativeTime } from '../lib/time'
import { terminalBus } from '../lib/terminalBus'
import { ChecksBadge, ReviewBadge, openExternal } from './GhShared'

// "Review with Claude" opens a claude session prompted to review the PR. We pass
// the PR url; resolving its local repo cwd is left to the user's shell/claude.
function reviewWithClaude(pr: GhPullRequest, cwd: string): void {
  terminalBus.open({
    cwd,
    initialCommand: `claude "/review ${pr.url}"`,
    label: `review #${pr.number}`
  })
}

export function PrRow({
  pr,
  showRepo,
  reviewCwd,
  onOpen,
  selected
}: {
  pr: GhPullRequest
  showRepo?: boolean
  reviewCwd?: string
  /** If provided, the row opens this handler instead of the external browser. */
  onOpen?: (pr: GhPullRequest) => void
  selected?: boolean
}) {
  return (
    <div
      className={`gh-row${selected ? ' selected' : ''}`}
      onClick={() => (onOpen ? onOpen(pr) : openExternal(pr.url))}
    >
      <div className="gh-row-main">
        <span className="gh-num">#{pr.number}</span>
        <span className="gh-title">{pr.title}</span>
        {pr.isDraft && <span className="gh-badge muted">draft</span>}
      </div>
      <div className="gh-row-meta">
        {showRepo && pr.repo && <span className="gh-repo">{pr.repo}</span>}
        {pr.headRefName && <span className="gh-branch">⎇ {pr.headRefName}</span>}
        <ChecksBadge state={pr.checksState} />
        <ReviewBadge decision={pr.reviewDecision} />
        {pr.author && <span className="gh-assignee">@{pr.author}</span>}
        <span className="gh-time">{relativeTime(pr.updatedAt)}</span>
        {reviewCwd && (
          <button
            className="gh-claude-btn"
            title="Review with claude"
            onClick={(e) => {
              e.stopPropagation()
              reviewWithClaude(pr, reviewCwd)
            }}
          >
            ◐ review
          </button>
        )}
      </div>
    </div>
  )
}
