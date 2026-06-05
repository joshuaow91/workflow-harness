import { useEffect, useState } from 'react'
import { GH_MISSING_PROJECT_SCOPE, type GhProjectItem } from '@shared/types'
import { useAsync } from '../lib/useAsync'
import { Dropdown } from '../components/Dropdown'
import { Icon } from '../components/Icon'

const NO_STATUS = 'No Status'

function numberFromUrl(url: string | null): number | null {
  const m = url?.match(/\/(?:issues|pull)\/(\d+)/)
  return m ? Number(m[1]) : null
}

function Card({ item, onOpen }: { item: GhProjectItem; onOpen: () => void }) {
  const clickable = item.type === 'Issue' && item.repo && numberFromUrl(item.url)
  return (
    <div
      className={`kanban-card${clickable ? ' clickable' : ''}`}
      onClick={() => clickable && onOpen()}
    >
      <div className="kanban-card-title">{item.title}</div>
      <div className="kanban-card-meta">
        <span className={`kanban-card-type ${item.type.toLowerCase()}`}>
          <Icon name={item.type === 'PullRequest' ? 'pr' : 'issue'} size={12} />
        </span>
        {item.repo && <span className="kanban-card-repo">{item.repo.split('/')[1] ?? item.repo}</span>}
      </div>
    </div>
  )
}

export function IssuesBoard({
  owner,
  onOpenItem
}: {
  owner: string
  onOpenItem: (repo: string, number: number, title: string) => void
}) {
  const projects = useAsync(() => window.api.github.listProjects(owner), [owner])
  const [proj, setProj] = useState<number | null>(null)

  useEffect(() => {
    if (proj == null && projects.data && projects.data.length > 0) setProj(projects.data[0].number)
  }, [projects.data, proj])

  const board = useAsync(
    () => (proj != null ? window.api.github.projectItems(owner, proj) : Promise.resolve(null)),
    [owner, proj]
  )

  const scopeError =
    (projects.error && projects.error.includes(GH_MISSING_PROJECT_SCOPE)) ||
    (board.error && board.error.includes(GH_MISSING_PROJECT_SCOPE))

  if (scopeError) {
    return (
      <div className="gh-state">
        The board needs the <code>read:project</code> scope. Run{' '}
        <code>gh auth refresh -s read:project</code>, then refresh.
      </div>
    )
  }
  if (projects.loading) return <div className="gh-state">Loading projects…</div>
  if (projects.error) return <div className="gh-state gh-error">{projects.error}</div>
  if (!projects.data || projects.data.length === 0)
    return <div className="gh-state">No projects found for {owner}.</div>

  const columns = board.data ? [...board.data.columns, NO_STATUS] : []
  const itemsFor = (col: string): GhProjectItem[] =>
    (board.data?.items ?? []).filter((i) => (i.status ?? NO_STATUS) === col)

  return (
    <div className="kanban-wrap">
      <div className="kanban-bar">
        <Dropdown
          value={proj != null ? String(proj) : ''}
          options={projects.data.map((p) => ({ value: String(p.number), label: p.title }))}
          onChange={(v) => setProj(Number(v))}
          minWidth={220}
        />
        <button className="tbtn" style={{ marginLeft: 'auto' }} onClick={() => board.reload()}>
          ↻ Refresh
        </button>
      </div>
      {board.loading ? (
        <div className="gh-state">Loading board…</div>
      ) : board.error ? (
        <div className="gh-state gh-error">{board.error}</div>
      ) : (
        <div className="kanban">
          {columns.map((col) => {
            const items = itemsFor(col)
            if (col === NO_STATUS && items.length === 0) return null
            return (
              <div key={col} className="kanban-col">
                <div className="kanban-col-head">
                  {col}
                  <span className="gh-count">{items.length}</span>
                </div>
                <div className="kanban-col-body">
                  {items.map((item) => (
                    <Card
                      key={item.id}
                      item={item}
                      onOpen={() => {
                        const n = numberFromUrl(item.url)
                        if (item.repo && n) onOpenItem(item.repo, n, item.title)
                      }}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
