import { useEffect, useMemo, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useAsync } from '../lib/useAsync'
import { useRepos } from '../sidebar/useRepos'
import { Dropdown } from '../components/Dropdown'

function DiffView({ text, loading }: { text: string; loading: boolean }) {
  if (loading) return <div className="gh-state">Loading diff…</div>
  if (!text.trim()) return <div className="gh-state">No changes, or select a file.</div>
  const lines = text.split('\n')
  return (
    <div className="diff-view">
      {lines.map((l, i) => {
        let cls = 'ctx'
        if (l.startsWith('@@')) cls = 'hunk'
        else if (
          l.startsWith('+++') ||
          l.startsWith('---') ||
          l.startsWith('diff ') ||
          l.startsWith('index ') ||
          l.startsWith('new file') ||
          l.startsWith('deleted file') ||
          l.startsWith('rename ') ||
          l.startsWith('similarity ') ||
          l.startsWith('Binary ')
        )
          cls = 'meta'
        else if (l.startsWith('+')) cls = 'add'
        else if (l.startsWith('-')) cls = 'del'
        return (
          <div key={i} className={`diff-line ${cls}`}>
            {l || ' '}
          </div>
        )
      })}
    </div>
  )
}

export function DiffTab() {
  const { repos } = useRepos()
  const targets = useMemo(() => {
    const list: { path: string; label: string }[] = []
    for (const r of repos) {
      list.push({ path: r.path, label: `${r.name} · primary` })
      for (const wt of r.worktrees ?? []) {
        if (wt.path !== r.path) list.push({ path: wt.path, label: `${r.name} · ${wt.branch ?? 'worktree'}` })
      }
    }
    return list
  }, [repos])

  const [path, setPath] = useState<string | null>(null)
  const [branchMode, setBranchMode] = useState(false)
  const [file, setFile] = useState<string | null>(null)

  useEffect(() => {
    if (!path && targets.length) setPath(targets[0].path)
  }, [path, targets])

  const changes = useAsync(
    () => (path ? window.api.diff.changes(path, branchMode) : Promise.resolve(null)),
    [path, branchMode]
  )
  const files = changes.data?.files ?? []

  useEffect(() => {
    setFile((prev) => (files.some((f) => f.path === prev) ? prev : files[0]?.path ?? null))
  }, [changes.data])

  const diff = useAsync(
    () => (path && file ? window.api.diff.fileDiff(path, file, branchMode) : Promise.resolve('')),
    [path, file, branchMode]
  )

  return (
    <div className="gh-tab">
      <div className="gh-header">
        <Dropdown
          value={path ?? ''}
          options={targets.map((t) => ({ value: t.path, label: t.label }))}
          onChange={setPath}
          searchable
          minWidth={260}
          placeholder="repo / worktree…"
        />
        <div className="seg">
          <button className={!branchMode ? 'on' : ''} onClick={() => setBranchMode(false)}>
            Uncommitted
          </button>
          <button className={branchMode ? 'on' : ''} onClick={() => setBranchMode(true)}>
            vs {changes.data?.base?.replace('origin/', '') ?? 'main'}
          </button>
        </div>
        <span className="gh-count">{files.length}</span>
        <button className="tbtn" style={{ marginLeft: 'auto' }} onClick={() => changes.reload()}>
          ↻ Refresh
        </button>
      </div>

      <PanelGroup direction="horizontal" className="gh-split" autoSaveId="diff-h">
        <Panel defaultSize={30} minSize={16}>
          <div className="diff-files">
            {changes.loading ? (
              <div className="gh-state">Loading…</div>
            ) : files.length === 0 ? (
              <div className="gh-state">No changes.</div>
            ) : (
              files.map((f) => (
                <div
                  key={f.path}
                  className={`diff-file${file === f.path ? ' active' : ''}`}
                  onClick={() => setFile(f.path)}
                  title={f.path}
                >
                  <span className={`diff-status s-${f.status}`}>{f.status}</span>
                  <span className="diff-file-path">{f.path}</span>
                  {!f.binary && (
                    <span className="diff-counts">
                      <span className="add">+{f.additions}</span>
                      <span className="del">−{f.deletions}</span>
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel defaultSize={70} minSize={30}>
          <DiffView text={diff.data ?? ''} loading={diff.loading} />
        </Panel>
      </PanelGroup>
    </div>
  )
}
