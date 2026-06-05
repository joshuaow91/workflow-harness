import { useEffect, useMemo, useState } from 'react'
import { GH_MISSING_PROJECT_SCOPE, type GhProjectItem } from '@shared/types'
import { useAsync } from '../lib/useAsync'
import { Dropdown } from '../components/Dropdown'
import { Icon } from '../components/Icon'

const NONE = '__none__'
const UNASSIGNED = '__unassigned__'

function numberFromUrl(url: string | null): number | null {
  const m = url?.match(/\/(?:issues|pull)\/(\d+)/)
  return m ? Number(m[1]) : null
}

function Card({
  item,
  onOpen,
  onDragStart
}: {
  item: GhProjectItem
  onOpen: () => void
  onDragStart: () => void
}) {
  const clickable = item.type !== 'DraftIssue' && item.repo && numberFromUrl(item.url)
  return (
    <div className="kanban-card" draggable onDragStart={onDragStart} onClick={() => clickable && onOpen()}>
      <div className="kanban-card-title">{item.title}</div>
      <div className="kanban-card-meta">
        <span className={`kanban-card-type ${item.type.toLowerCase()}`}>
          <Icon name={item.type === 'PullRequest' ? 'pr' : 'issue'} size={12} />
        </span>
        {item.repo && <span className="kanban-card-repo">{item.repo.split('/')[1] ?? item.repo}</span>}
        {item.assignees.length > 0 && <span className="kanban-card-assignee">{item.assignees.join(', ')}</span>}
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
    if (proj == null && projects.data && projects.data.length > 0) {
      const tp = projects.data.find((p) => /technology pipeline/i.test(p.title))
      setProj((tp ?? projects.data[0]).number)
    }
  }, [projects.data, proj])

  const board = useAsync(
    () => (proj != null ? window.api.github.projectItems(owner, proj) : Promise.resolve(null)),
    [owner, proj]
  )

  const [items, setItems] = useState<GhProjectItem[]>([])
  useEffect(() => setItems(board.data?.items ?? []), [board.data])

  const [groupBy, setGroupBy] = useState('Status')
  const [employee, setEmployee] = useState('')
  const [search, setSearch] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const data = board.data
  const field = data?.fields.find((f) => f.name === groupBy)
  const groupOptions = useMemo(
    () => [...(data?.fields.map((f) => f.name) ?? []), 'Assignee'],
    [data]
  )
  const allAssignees = useMemo(() => {
    const s = new Set<string>()
    items.forEach((i) => i.assignees.forEach((a) => s.add(a)))
    return [...s].sort()
  }, [items])

  const visible = items.filter(
    (it) =>
      (!search || it.title.toLowerCase().includes(search.toLowerCase())) &&
      (!employee || it.assignees.includes(employee))
  )

  const columns: { key: string; label: string; optionId?: string }[] =
    groupBy === 'Assignee'
      ? [{ key: UNASSIGNED, label: 'Unassigned' }, ...allAssignees.map((a) => ({ key: a, label: a }))]
      : field
        ? [{ key: NONE, label: `No ${groupBy}` }, ...field.options.map((o) => ({ key: o.name, label: o.name, optionId: o.id }))]
        : []

  const itemsInCol = (key: string): GhProjectItem[] => {
    if (groupBy === 'Assignee') {
      if (key === UNASSIGNED) return visible.filter((i) => i.assignees.length === 0)
      return visible.filter((i) => i.assignees.includes(key))
    }
    return visible.filter((i) => (i.fieldValues[groupBy] ?? NONE) === key)
  }

  const dropTo = async (col: { key: string; optionId?: string }): Promise<void> => {
    const it = items.find((x) => x.id === dragId)
    setDragId(null)
    setOver(null)
    if (!it || !data || busy) return

    if (groupBy === 'Assignee') {
      const number = numberFromUrl(it.url)
      if (!it.repo || !number || it.type !== 'Issue') return
      const target = col.key === UNASSIGNED ? null : col.key
      if (target && it.assignees.includes(target)) return
      setBusy(true)
      try {
        await window.api.github.editIssue(it.repo, number, {
          addAssignees: target ? [target] : [],
          removeAssignees: it.assignees.filter((a) => a !== target)
        })
        board.reload()
      } catch (e) {
        window.alert(`Could not reassign:\n${(e as Error).message}`)
      } finally {
        setBusy(false)
      }
      return
    }

    if (!field) return
    if ((it.fieldValues[groupBy] ?? NONE) === col.key) return
    // optimistic
    setItems((prev) =>
      prev.map((x) => {
        if (x.id !== it.id) return x
        const fv = { ...x.fieldValues }
        if (col.key === NONE) delete fv[groupBy]
        else fv[groupBy] = col.key
        return { ...x, fieldValues: fv }
      })
    )
    setBusy(true)
    try {
      await window.api.github.setProjectField(data.projectId, it.id, field.id, col.optionId ?? '')
      board.reload()
    } catch (e) {
      const msg = (e as Error).message
      window.alert(
        msg.includes(GH_MISSING_PROJECT_SCOPE)
          ? 'Updating the board needs the write “project” scope (read:project is read-only).\nRun:  gh auth refresh -s project'
          : `Could not move:\n${msg}`
      )
      board.reload()
    } finally {
      setBusy(false)
    }
  }

  const scopeError =
    (projects.error && projects.error.includes(GH_MISSING_PROJECT_SCOPE)) ||
    (board.error && board.error.includes(GH_MISSING_PROJECT_SCOPE))
  if (scopeError)
    return (
      <div className="gh-state">
        The board needs the <code>read:project</code> scope. Run{' '}
        <code>gh auth refresh -s read:project</code>, then refresh.
      </div>
    )
  if (projects.loading) return <div className="gh-state">Loading projects…</div>
  if (projects.error) return <div className="gh-state gh-error">{projects.error}</div>
  if (!projects.data || projects.data.length === 0)
    return <div className="gh-state">No projects found for {owner}.</div>

  return (
    <div className="kanban-wrap">
      <div className="kanban-bar">
        <Dropdown
          value={proj != null ? String(proj) : ''}
          options={projects.data.map((p) => ({ value: String(p.number), label: p.title }))}
          onChange={(v) => setProj(Number(v))}
          minWidth={190}
        />
        <span className="kanban-bar-label">Group by</span>
        <Dropdown
          value={groupBy}
          options={groupOptions.map((g) => ({ value: g, label: g }))}
          onChange={setGroupBy}
          minWidth={130}
        />
        <Dropdown
          value={employee}
          options={[{ value: '', label: 'All employees' }, ...allAssignees.map((a) => ({ value: a, label: a }))]}
          onChange={setEmployee}
          searchable
          minWidth={150}
        />
        <input
          className="issue-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cards…"
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
            const colItems = itemsInCol(col.key)
            return (
              <div
                key={col.key}
                className={`kanban-col${over === col.key ? ' over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (over !== col.key) setOver(col.key)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  void dropTo(col)
                }}
              >
                <div className="kanban-col-head">
                  {col.label}
                  <span className="gh-count">{colItems.length}</span>
                </div>
                <div className="kanban-col-body">
                  {colItems.map((item) => (
                    <Card
                      key={item.id}
                      item={item}
                      onDragStart={() => setDragId(item.id)}
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
