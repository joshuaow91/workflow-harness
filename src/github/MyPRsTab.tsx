import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { GhPullRequest } from '@shared/types'
import { useAsync } from '../lib/useAsync'
import { useRepos } from '../sidebar/useRepos'
import { WebFrame } from '../panes/WebFrame'
import { GhHeader, GhState } from './GhShared'
import { PrRow } from './PrRow'

// The GitHub tabs unmount when you switch away, so keep the open PR preview in
// localStorage to restore it when you come back (and across restarts).
const SEL_KEY = 'harness:myprs:selected'
function loadSelected(): GhPullRequest | null {
  try {
    return JSON.parse(localStorage.getItem(SEL_KEY) || 'null') as GhPullRequest | null
  } catch {
    return null
  }
}

export function MyPRsTab() {
  const { repos } = useRepos()
  const { data, error, loading, reload } = useAsync(() => window.api.github.myPRsAll(), [])
  const prs = data ?? []
  const [selected, setSelectedState] = useState<GhPullRequest | null>(loadSelected)
  const setSelected = (pr: GhPullRequest | null): void => {
    setSelectedState(pr)
    try {
      if (pr) localStorage.setItem(SEL_KEY, JSON.stringify(pr))
      else localStorage.removeItem(SEL_KEY)
    } catch {
      /* ignore quota / serialization errors */
    }
  }

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
        <PanelGroup direction="horizontal" className="gh-split">
          <Panel defaultSize={30} minSize={18}>
            {list}
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel defaultSize={70} minSize={30}>
            <div className="pr-preview">
              <div className="pr-preview-bar">
                <span className="pr-preview-title" title={selected.title}>
                  #{selected.number} {selected.title}
                </span>
                <button
                  className="tbtn"
                  onClick={() => void window.api.system.openExternal(selected.url)}
                >
                  Open <Icon name="external" size={12} />
                </button>
                <button className="term-act" title="Close preview" onClick={() => setSelected(null)}>
                  <Icon name="close" size={13} />
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
