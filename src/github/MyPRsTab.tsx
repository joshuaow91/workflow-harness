import { useMemo, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { GhPullRequest } from '@shared/types'
import { useAsync } from '../lib/useAsync'
import { useRepos } from '../sidebar/useRepos'
import { WebFrame } from '../panes/WebFrame'
import { GhHeader, GhState } from './GhShared'
import { PrRow } from './PrRow'

export function MyPRsTab() {
  const { repos } = useRepos()
  const { data, error, loading, reload } = useAsync(() => window.api.github.myPRsAll(), [])
  const prs = data ?? []
  const [selected, setSelected] = useState<GhPullRequest | null>(null)

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

  const list = (
    <div className="gh-list">
      <GhState loading={loading} error={error} empty={prs.length === 0} emptyText="No open PRs authored by you." />
      {groups.map(([repo, rows]) => (
        <div key={repo} className="gh-group">
          <div className="gh-group-head">
            {repo}
            <span className="gh-count">{rows.length}</span>
          </div>
          {rows.map((pr) => (
            <PrRow
              key={pr.number}
              pr={pr}
              reviewCwd={localPathFor(repo)}
              onOpen={setSelected}
              selected={selected?.url === pr.url}
            />
          ))}
        </div>
      ))}
    </div>
  )

  return (
    <div className="gh-tab">
      <GhHeader onRefresh={reload} count={prs.length}>
        <span className="gh-heading">My open PRs — by repo</span>
      </GhHeader>
      {selected ? (
        <PanelGroup direction="vertical" className="gh-split">
          <Panel defaultSize={45} minSize={20}>
            {list}
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel defaultSize={55} minSize={20}>
            <div className="pr-preview">
              <div className="pr-preview-bar">
                <span className="pr-preview-title" title={selected.title}>
                  #{selected.number} {selected.title}
                </span>
                <button
                  className="tbtn"
                  onClick={() => void window.api.system.openExternal(selected.url)}
                >
                  Open ↗
                </button>
                <button className="term-act" title="Close preview" onClick={() => setSelected(null)}>
                  ✕
                </button>
              </div>
              <div className="pr-preview-frame">
                <WebFrame src={selected.url} editableAddress={false} />
              </div>
            </div>
          </Panel>
        </PanelGroup>
      ) : (
        list
      )}
    </div>
  )
}
