import { useEffect, useMemo, useState } from 'react'
import { GH_MISSING_PROJECT_SCOPE, type GhProjectItem } from '@shared/types'
import { useAsync } from '../lib/useAsync'
import { useRepos } from '../sidebar/useRepos'
import { GhHeader, GhState, openExternal } from './GhShared'

const NO_STATUS = 'No Status'

function ScopeCard() {
  const cmd = 'gh auth refresh -s read:project'
  return (
    <div className="placeholder">
      <div className="ph-emoji">🔒</div>
      <div className="ph-title">GitHub Projects needs one more scope</div>
      <div className="ph-sub">
        Your <code>gh</code> token is missing <code>read:project</code>. Grant it once, then refresh:
        <div className="scope-cmd">
          <code>{cmd}</code>
          <button className="tbtn" onClick={() => void navigator.clipboard.writeText(cmd)}>
            Copy
          </button>
        </div>
      </div>
    </div>
  )
}

export function BoardTab() {
  const { repos } = useRepos()
  const owners = useMemo(
    () => [...new Set(repos.map((r) => r.nameWithOwner?.split('/')[0]).filter(Boolean) as string[])],
    [repos]
  )
  const [owner, setOwner] = useState<string | null>(null)
  useEffect(() => {
    if (!owner && owners.length > 0) setOwner(owners[0])
  }, [owner, owners])

  const projects = useAsync(
    () => (owner ? window.api.github.listProjects(owner) : Promise.resolve([])),
    [owner]
  )
  const [projectNum, setProjectNum] = useState<number | null>(null)
  useEffect(() => {
    if (projects.data && projects.data.length > 0) setProjectNum((p) => p ?? projects.data![0].number)
  }, [projects.data])

  const board = useAsync(
    () =>
      owner && projectNum
        ? window.api.github.projectItems(owner, projectNum)
        : Promise.resolve(null),
    [owner, projectNum]
  )

  if (projects.error?.includes(GH_MISSING_PROJECT_SCOPE)) return <ScopeCard />

  const columns = board.data ? [...board.data.columns, NO_STATUS] : []
  const itemsByCol = (col: string): GhProjectItem[] =>
    (board.data?.items ?? []).filter((it) => (it.status ?? NO_STATUS) === col)

  return (
    <div className="gh-tab">
      <GhHeader onRefresh={() => board.reload()}>
        <select className="gh-select" value={owner ?? ''} onChange={(e) => { setOwner(e.target.value); setProjectNum(null) }}>
          {owners.length === 0 && <option value="">No owners</option>}
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select
          className="gh-select"
          value={projectNum ?? ''}
          onChange={(e) => setProjectNum(Number(e.target.value))}
          disabled={!projects.data || projects.data.length === 0}
        >
          {(projects.data ?? []).map((p) => (
            <option key={p.number} value={p.number}>
              {p.title}
            </option>
          ))}
          {projects.data && projects.data.length === 0 && <option value="">No projects</option>}
        </select>
        {board.data?.url && (
          <button className="tbtn" onClick={() => openExternal(board.data!.url)}>
            Open ↗
          </button>
        )}
      </GhHeader>

      <GhState
        loading={projects.loading || board.loading}
        error={projects.error || board.error}
        empty={!!board.data && board.data.items.length === 0}
        emptyText="No items on this board."
      />

      {board.data && board.data.items.length > 0 && (
        <div className="board-columns">
          {columns
            .filter((col) => itemsByCol(col).length > 0)
            .map((col) => {
              const items = itemsByCol(col)
              return (
                <div key={col} className="board-col">
                  <div className="board-col-head">
                    {col}
                    <span className="gh-count">{items.length}</span>
                  </div>
                  {items.map((it) => (
                    <div
                      key={it.id}
                      className="board-card"
                      onClick={() => it.url && openExternal(it.url)}
                    >
                      <div className="board-card-title">{it.title}</div>
                      <div className="board-card-meta">
                        <span className={`type-dot ${it.type}`} />
                        {it.repo && <span className="gh-repo">{it.repo}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}
