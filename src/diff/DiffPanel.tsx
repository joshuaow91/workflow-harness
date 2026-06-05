import { useEffect, useState, type ReactNode } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useAsync } from '../lib/useAsync'

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

// Changes (file list + colored diff) for one repo/worktree path. Reused by the
// Changes tab and the per-session diff modal.
export function DiffPanel({ path, headerLeft }: { path: string; headerLeft?: ReactNode }) {
  const [branchMode, setBranchMode] = useState(false)
  const [file, setFile] = useState<string | null>(null)

  const changes = useAsync(() => window.api.diff.changes(path, branchMode), [path, branchMode])
  const files = changes.data?.files ?? []

  useEffect(() => {
    setFile((prev) => (files.some((f) => f.path === prev) ? prev : files[0]?.path ?? null))
  }, [changes.data])

  const diff = useAsync(
    () => (file ? window.api.diff.fileDiff(path, file, branchMode) : Promise.resolve('')),
    [path, file, branchMode]
  )

  return (
    <>
      <div className="gh-header">
        {headerLeft}
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
    </>
  )
}
