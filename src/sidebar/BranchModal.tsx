import { useEffect, useMemo, useState } from 'react'
import type { RepoBranchStatus } from '@shared/types'
import { useAsync } from '../lib/useAsync'
import { Icon } from '../components/Icon'

// Manage a repo's local branches: pull the default branch up to date, and clean
// out gone (remote-deleted) / merged branches — what you'd otherwise do by hand
// in VS Code (checkout master, pull, delete old branches).
export function BranchModal({
  repoPath,
  repoName,
  onClose
}: {
  repoPath: string
  repoName: string
  onClose: () => void
}) {
  const q = useAsync<RepoBranchStatus | null>(() => window.api.branch.status(repoPath, true), [repoPath])
  const status = q.data
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'pull' | 'delete' | 'checkout' | null>(null)
  const [note, setNote] = useState<string | null>(null)

  // Deletable = anything except the current branch and the default. Worktree
  // branches are included — deleting one removes its worktree first.
  const deletable = useMemo(
    () => (status?.branches ?? []).filter((b) => !b.current && !b.isDefault),
    [status]
  )
  const goneCount = deletable.filter((b) => b.gone).length
  const mergedCount = deletable.filter((b) => b.merged && !b.gone).length

  // Pre-select the gone (remote-deleted) branches once the status loads.
  useEffect(() => {
    if (status) setSel(new Set(deletable.filter((b) => b.gone).map((b) => b.name)))
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (name: string): void =>
    setSel((s) => {
      const n = new Set(s)
      n.has(name) ? n.delete(name) : n.add(name)
      return n
    })

  const pull = async (): Promise<void> => {
    setBusy('pull')
    setNote(null)
    try {
      await window.api.branch.pullDefault(repoPath)
      q.reload()
    } catch (e) {
      setNote(`Pull failed: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const checkout = async (): Promise<void> => {
    if (!status) return
    setBusy('checkout')
    setNote(null)
    try {
      await window.api.branch.checkout(repoPath, status.defaultBranch)
      q.reload()
    } catch (e) {
      setNote(`Switch failed (commit/stash changes first?): ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const del = async (): Promise<void> => {
    if (sel.size === 0) return
    const wtSel = (status?.branches ?? []).filter((b) => sel.has(b.name) && b.worktree).length
    const warn = wtSel
      ? `\n\n${wtSel} ${wtSel > 1 ? 'are' : 'is'} checked out in a worktree — that worktree will be removed (uncommitted changes discarded).`
      : ''
    if (!window.confirm(`Delete ${sel.size} local branch${sel.size > 1 ? 'es' : ''}?${warn}\n\nThis can't be undone.`))
      return
    setBusy('delete')
    setNote(null)
    try {
      const r = await window.api.branch.delete(repoPath, [...sel], true)
      setNote(
        `Deleted ${r.deleted.length}${r.failed.length ? ` · ${r.failed.length} failed (${r.failed[0].error})` : ''}`
      )
      setSel(new Set())
      q.reload()
    } catch (e) {
      setNote(`Delete failed: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal branch-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="branch-modal-title">
            Branches — <strong>{repoName}</strong>
          </span>
          <button className="term-act" title="Refresh" onClick={() => q.reload()}>
            <Icon name="refresh" size={14} />
          </button>
          <button className="term-act" title="Close" onClick={onClose}>
            <Icon name="close" size={13} />
          </button>
        </div>

        <div className="modal-body branch-body">
          {q.loading && !status && <div className="side-term-hint">Fetching branches…</div>}
          {q.error && <div className="gh-state gh-error">{q.error}</div>}

          {status && (
            <>
              {/* default branch + pull */}
              <div className="branch-default">
                <div>
                  <span className="branch-def-name">{status.defaultBranch}</span>
                  <span className="branch-def-state">
                    {status.defaultBehind > 0
                      ? `${status.defaultBehind} behind origin`
                      : 'up to date'}
                  </span>
                  {status.currentBranch !== status.defaultBranch && (
                    <span className="branch-on">on {status.currentBranch}</span>
                  )}
                </div>
                <div className="branch-def-actions">
                  {status.currentBranch !== status.defaultBranch && (
                    <button className="tbtn" disabled={busy != null} onClick={() => void checkout()}>
                      {busy === 'checkout' ? 'Switching…' : `Switch to ${status.defaultBranch}`}
                    </button>
                  )}
                  <button
                    className="tbtn"
                    disabled={busy != null || status.defaultBehind === 0}
                    onClick={() => void pull()}
                  >
                    {busy === 'pull' ? 'Pulling…' : 'Pull latest'}
                  </button>
                </div>
              </div>

              {/* cleanup */}
              <div className="branch-cleanup-head">
                <span>
                  Cleanup — <b>{goneCount}</b> gone · <b>{mergedCount}</b> merged ·{' '}
                  {deletable.length} total
                </span>
                <div className="branch-bulk">
                  <button
                    className="branch-link"
                    onClick={() => setSel(new Set(deletable.filter((b) => b.gone).map((b) => b.name)))}
                  >
                    select gone
                  </button>
                  <button className="branch-link" onClick={() => setSel(new Set(deletable.map((b) => b.name)))}>
                    all
                  </button>
                  <button className="branch-link" onClick={() => setSel(new Set())}>
                    none
                  </button>
                </div>
              </div>

              <div className="branch-list">
                {deletable.length === 0 && (
                  <div className="side-term-hint">Nothing to clean — no stale branches.</div>
                )}
                {deletable.map((b) => (
                  <label key={b.name} className="branch-row">
                    <input type="checkbox" checked={sel.has(b.name)} onChange={() => toggle(b.name)} />
                    <span className="branch-name" title={b.name}>
                      {b.name}
                    </span>
                    {b.gone && <span className="branch-tag gone">gone</span>}
                    {b.merged && !b.gone && <span className="branch-tag merged">merged</span>}
                    {b.worktree && <span className="branch-tag wt">worktree</span>}
                  </label>
                ))}
                {/* protected — can't delete the branch you're on or the default */}
                {(status.branches ?? [])
                  .filter((b) => b.current || b.isDefault)
                  .map((b) => (
                    <div key={b.name} className="branch-row disabled" title="Can't delete (current / default)">
                      <span className="branch-name">{b.name}</span>
                      {b.current && <span className="branch-tag cur">current</span>}
                      {b.isDefault && <span className="branch-tag def">default</span>}
                    </div>
                  ))}
              </div>
            </>
          )}

          {note && <div className="branch-note">{note}</div>}
        </div>

        <div className="modal-foot branch-foot">
          <span className="branch-sel-count">{sel.size} selected</span>
          <button className="tbtn danger" disabled={busy != null || sel.size === 0} onClick={() => void del()}>
            {busy === 'delete' ? 'Deleting…' : `Delete selected`}
          </button>
        </div>
      </div>
    </div>
  )
}
