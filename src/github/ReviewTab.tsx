import { useAsync } from '../lib/useAsync'
import { useRepos } from '../sidebar/useRepos'
import { GhHeader, GhState } from './GhShared'
import { PrRow } from './PrRow'

export function ReviewTab() {
  const { repos } = useRepos()
  const { data, error, loading, reload } = useAsync(() => window.api.github.reviewPRs(), [])
  const prs = data ?? []

  const localPathFor = (nameWithOwner: string): string | undefined =>
    repos.find((r) => r.nameWithOwner === nameWithOwner)?.path

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
          <PrRow key={`${pr.repo}#${pr.number}`} pr={pr} showRepo reviewCwd={localPathFor(pr.repo)} />
        ))}
      </div>
    </div>
  )
}
