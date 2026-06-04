import { useMemo } from 'react'
import type { GhPullRequest } from '@shared/types'
import { useAsync } from '../lib/useAsync'
import { useRepos } from '../sidebar/useRepos'
import { GhHeader, GhState } from './GhShared'
import { PrRow } from './PrRow'

export function MyPRsTab() {
  const { repos } = useRepos()
  const { data, error, loading, reload } = useAsync(() => window.api.github.myPRsAll(), [])
  const prs = data ?? []

  const groups = useMemo(() => {
    const byRepo = new Map<string, GhPullRequest[]>()
    for (const pr of prs) {
      const list = byRepo.get(pr.repo) ?? []
      list.push(pr)
      byRepo.set(pr.repo, list)
    }
    return [...byRepo.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [prs])

  const localPathFor = (nameWithOwner: string): string | undefined =>
    repos.find((r) => r.nameWithOwner === nameWithOwner)?.path

  return (
    <div className="gh-tab">
      <GhHeader onRefresh={reload} count={prs.length}>
        <span className="gh-heading">My open PRs — by repo</span>
      </GhHeader>
      <div className="gh-list">
        <GhState loading={loading} error={error} empty={prs.length === 0} emptyText="No open PRs authored by you." />
        {groups.map(([repo, list]) => (
          <div key={repo} className="gh-group">
            <div className="gh-group-head">
              {repo}
              <span className="gh-count">{list.length}</span>
            </div>
            {list.map((pr) => (
              <PrRow key={pr.number} pr={pr} reviewCwd={localPathFor(repo)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
