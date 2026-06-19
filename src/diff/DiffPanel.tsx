import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useAsync } from '../lib/useAsync'
import { DiffView } from './DiffView'

// Changes (file list + colored diff) for one repo/worktree path. Reused by the
// Changes tab and the per-session diff modal.
export function DiffPanel({
  path,
  headerLeft,
  initialBranchMode = false,
  diffRef
}: {
  path: string
  headerLeft?: ReactNode
  initialBranchMode?: boolean
  /** Diff a branch that isn't checked out (base...<diffRef>). When set, the
   *  Uncommitted view is unavailable — there's no working tree for that ref. */
  diffRef?: string
}) {
  // A non-checked-out branch has no working copy, so only the committed (vs base)
  // view makes sense — force it and lock the toggle.
  const refLocked = diffRef != null
  const [branchMode, setBranchMode] = useState(initialBranchMode || refLocked)
  const [file, setFile] = useState<string | null>(null)
  useEffect(() => {
    if (refLocked) setBranchMode(true)
  }, [refLocked])

  const changes = useAsync(
    () => window.api.diff.changes(path, branchMode, diffRef),
    [path, branchMode, diffRef]
  )
  const files = changes.data?.files ?? []

  useEffect(() => {
    setFile((prev) => (files.some((f) => f.path === prev) ? prev : files[0]?.path ?? null))
  }, [changes.data])

  const diff = useAsync(
    () => (file ? window.api.diff.fileDiff(path, file, branchMode, diffRef) : Promise.resolve('')),
    [path, file, branchMode, diffRef]
  )

  return (
    <>
      <div className="gh-header">
        {headerLeft}
        <div className="seg">
          <button
            className={!branchMode ? 'on' : ''}
            disabled={refLocked}
            title={refLocked ? 'Branch is not checked out — no working tree' : undefined}
            onClick={() => setBranchMode(false)}
          >
            Uncommitted
          </button>
          <button className={branchMode ? 'on' : ''} onClick={() => setBranchMode(true)}>
            vs {changes.data?.base?.replace('origin/', '') ?? 'main'}
          </button>
        </div>
        <span className="gh-count">{files.length}</span>
        <button className="tbtn" style={{ marginLeft: 'auto' }} onClick={() => changes.reload()}>
          <Icon name="refresh" size={14} /> Refresh
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
