import { useEffect, useMemo, useRef, useState } from 'react'
import { GH_MISSING_PROJECT_SCOPE, type GhProjectItem } from '@shared/types'
import { useAsync } from '../lib/useAsync'
import { Dropdown } from '../components/Dropdown'
import { Icon } from '../components/Icon'

const NONE = '__none__'
const BOARD_KEY = 'harness:issues-board'

function loadBoardUi(): { mode?: string; employee?: string } {
  try {
    return JSON.parse(localStorage.getItem(BOARD_KEY) || '{}')
  } catch {
    return {}
  }
}

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
    () => (proj != null ? window.api.github.projectItems(owner, proj, false) : Promise.resolve(null)),
    [owner, proj]
  )
  const refreshBoard = (): void => {
    if (proj != null) void window.api.github.projectItems(owner, proj, true).then((d) => setItems(d.items))
  }

  const [items, setItems] = useState<GhProjectItem[]>([])
  useEffect(() => setItems(board.data?.items ?? []), [board.data])

  const savedBoard = useRef(loadBoardUi()).current
  const [mode, setMode] = useState<'Status' | 'Priority' | 'Assignee'>(
    (savedBoard.mode as 'Status' | 'Priority' | 'Assignee') ?? 'Status'
  )
  const [employee, setEmployee] = useState(savedBoard.employee ?? '')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [priCollapsed, setPriCollapsed] = useState<Set<string>>(new Set())
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(BOARD_KEY, JSON.stringify({ mode, employee }))
    } catch {
      /* ignore */
    }
  }, [mode, employee])

  const data = board.data
  const statusField = data?.fields.find((f) => /^status$/i.test(f.name))
  const priorityField = data?.fields.find((f) => /^priority$/i.test(f.name))

  const statusCols = useMemo(
    () =>
      statusField
        ? [{ key: NONE, label: 'No Status' }, ...statusField.options.map((o) => ({ key: o.name, label: o.name }))]
        : [],
    [statusField]
  )
  const priorityRows = priorityField
    ? [{ key: NONE, label: 'No Priority' }, ...priorityField.options.map((o) => ({ key: o.name, label: o.name }))]
    : [{ key: NONE, label: 'No Priority' }]

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
  const statusOf = (it: GhProjectItem): string => it.fieldValues['Status'] ?? NONE
  const priorityOf = (it: GhProjectItem): string => it.fieldValues['Priority'] ?? NONE

  const openItem = (it: GhProjectItem): void => {
    const n = numberFromUrl(it.url)
    if (it.repo && n) onOpenItem(it.repo, n, it.title)
  }

  const applyField = async (it: GhProjectItem, fieldName: string, valueKey: string): Promise<void> => {
    const field = data?.fields.find((f) => f.name === fieldName)
    if (!field || !data) return
    const optionId = valueKey === NONE ? '' : (field.options.find((o) => o.name === valueKey)?.id ?? '')
    setItems((prev) =>
      prev.map((x) => {
        if (x.id !== it.id) return x
        const fv = { ...x.fieldValues }
        if (valueKey === NONE) delete fv[fieldName]
        else fv[fieldName] = valueKey
        return { ...x, fieldValues: fv }
      })
    )
    try {
      await window.api.github.setProjectField(data.projectId, it.id, field.id, optionId)
    } catch (e) {
      const m = (e as Error).message
      window.alert(
        m.includes(GH_MISSING_PROJECT_SCOPE)
          ? 'Updating the board needs the write “project” scope (read:project is read-only).\nRun:  gh auth refresh -s project'
          : `Could not update:\n${m}`
      )
    }
  }

  const dropInto = async (statusKey: string, priorityKey?: string): Promise<void> => {
    const it = items.find((x) => x.id === dragId)
    setDragId(null)
    setOver(null)
    if (!it || busy) return
    setBusy(true)
    try {
      // Optimistic only — no board refetch (that re-queries all cards = costly).
      if (statusOf(it) !== statusKey) await applyField(it, 'Status', statusKey)
      if (priorityKey !== undefined && priorityOf(it) !== priorityKey)
        await applyField(it, 'Priority', priorityKey)
    } finally {
      setBusy(false)
    }
  }

  // Render the status columns for a given item set + drop target.
  const Columns = (
    cellItems: (statusKey: string) => GhProjectItem[],
    keyPrefix: string,
    onDrop: (statusKey: string) => void,
    compact = false
  ) => (
    <div className={compact ? 'kanban-flex' : 'kanban'}>
      {statusCols.map((col) => {
        const cellKey = `${keyPrefix}:${col.key}`
        const its = cellItems(col.key)
        return (
          <div
            key={col.key}
            className={`kanban-col${compact ? ' compact' : ''}${over === cellKey ? ' over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              if (over !== cellKey) setOver(cellKey)
            }}
            onDrop={(e) => {
              e.preventDefault()
              onDrop(col.key)
            }}
          >
            <div className="kanban-col-head">
              {col.label}
              <span className="gh-count">{its.length}</span>
            </div>
            <div className="kanban-col-body">
              {its.map((it) => (
                <Card key={it.id} item={it} onDragStart={() => setDragId(it.id)} onOpen={() => openItem(it)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )

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

  const toggleUser = (u: string): void =>
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(u)) n.delete(u)
      else n.add(u)
      return n
    })

  const userLanes = [...allAssignees, '__unassigned__']

  return (
    <div className="kanban-wrap">
      <div className="kanban-bar">
        <Dropdown
          value={proj != null ? String(proj) : ''}
          options={projects.data.map((p) => ({ value: String(p.number), label: p.title }))}
          onChange={(v) => setProj(Number(v))}
          minWidth={180}
        />
        <span className="kanban-bar-label">View</span>
        <Dropdown
          value={mode}
          options={[
            { value: 'Status', label: 'Status' },
            { value: 'Priority', label: 'Priority × Status' },
            { value: 'Assignee', label: 'By assignee' }
          ]}
          onChange={(v) => setMode(v as typeof mode)}
          minWidth={140}
        />
        <Dropdown
          value={employee}
          options={[{ value: '', label: 'All employees' }, ...allAssignees.map((a) => ({ value: a, label: a }))]}
          onChange={setEmployee}
          searchable
          minWidth={150}
        />
        <input className="issue-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search cards…" />
        <button className="tbtn" style={{ marginLeft: 'auto' }} onClick={refreshBoard}>
          <Icon name="refresh" size={14} /> Refresh
        </button>
      </div>

      {board.loading ? (
        <div className="gh-state">Loading board…</div>
      ) : board.error ? (
        <div className="gh-state gh-error">{board.error}</div>
      ) : mode === 'Status' ? (
        Columns((s) => visible.filter((i) => statusOf(i) === s), 's', (s) => void dropInto(s))
      ) : mode === 'Priority' ? (
        <div className="board-body">
          <div className="lanes">
            {priorityRows.map((row) => {
              const open = !priCollapsed.has(row.key)
              const rowItems = visible.filter((i) => priorityOf(i) === row.key)
              return (
                <div key={row.key} className="accordion">
                  <div
                    className="accordion-head"
                    onClick={() =>
                      setPriCollapsed((s) => {
                        const n = new Set(s)
                        if (n.has(row.key)) n.delete(row.key)
                        else n.add(row.key)
                        return n
                      })
                    }
                  >
                    <span className="accordion-caret">{open ? '▾' : '▸'}</span>
                    {row.label}
                    <span className="gh-count">{rowItems.length}</span>
                  </div>
                  {open &&
                    Columns(
                      (s) => rowItems.filter((i) => statusOf(i) === s),
                      `p:${row.key}`,
                      (s) => void dropInto(s, row.key),
                      true
                    )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="board-body">
          <div className="lanes">
            {userLanes.map((user) => {
              const isU = user === '__unassigned__'
              const mine = visible.filter((i) =>
                isU ? i.assignees.length === 0 : i.assignees.includes(user)
              )
              const open = expanded.has(user)
              return (
                <div key={user} className="accordion">
                  <div className="accordion-head" onClick={() => toggleUser(user)}>
                    <span className="accordion-caret">{open ? '▾' : '▸'}</span>
                    {isU ? 'Unassigned' : user}
                    <span className="gh-count">{mine.length}</span>
                  </div>
                  {open &&
                    Columns(
                      (s) => mine.filter((i) => statusOf(i) === s),
                      `u:${user}`,
                      (s) => void dropInto(s),
                      true
                    )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
