import { useAsync } from '../lib/useAsync'
import { useRepos } from '../sidebar/useRepos'
import { GhHeader, GhState, RepoPicker } from './GhShared'
import { PrRow } from './PrRow'
import { useSelectedRepo } from './githubStore'

export function MyPRsTab() {
  const repo = useSelectedRepo()
  const { repos } = useRepos()
  const localPath = repos.find((r) => r.nameWithOwner === repo)?.path

  const { data, error, loading, reload } = useAsync(
    () => (repo ? window.api.github.myPRs(repo) : Promise.resolve([])),
    [repo]
  )
  const prs = data ?? []

  return (
    <div className="gh-tab">
      <GhHeader onRefresh={reload} count={prs.length}>
        <RepoPicker />
      </GhHeader>
      <div className="gh-list">
        <GhState loading={loading} error={error} empty={prs.length === 0} emptyText="No open PRs authored by you." />
        {prs.map((pr) => (
          <PrRow key={pr.number} pr={pr} reviewCwd={localPath} />
        ))}
      </div>
    </div>
  )
}
