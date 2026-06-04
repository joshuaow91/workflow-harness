import { useAsync } from '../lib/useAsync'
import { relativeTime } from '../lib/time'
import { GhHeader, GhState, LabelChips, RepoPicker, openExternal } from './GhShared'
import { useSelectedRepo } from './githubStore'

export function IssuesTab() {
  const repo = useSelectedRepo()
  const { data, error, loading, reload } = useAsync(
    () => (repo ? window.api.github.issues(repo) : Promise.resolve([])),
    [repo]
  )
  const issues = data ?? []

  return (
    <div className="gh-tab">
      <GhHeader onRefresh={reload} count={issues.length}>
        <RepoPicker />
      </GhHeader>
      <div className="gh-list">
        <GhState
          loading={loading}
          error={error}
          empty={issues.length === 0}
          emptyText="No open issues."
        />
        {issues.map((it) => (
          <div key={it.number} className="gh-row" onClick={() => openExternal(it.url)}>
            <div className="gh-row-main">
              <span className="gh-num">#{it.number}</span>
              <span className="gh-title">{it.title}</span>
            </div>
            <div className="gh-row-meta">
              <LabelChips labels={it.labels} />
              {it.assignees.length > 0 && (
                <span className="gh-assignee">@{it.assignees.join(', @')}</span>
              )}
              <span className="gh-time">{relativeTime(it.updatedAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
