import { useState } from 'react'
import { Icon } from '../components/Icon'
import { createPortal } from 'react-dom'
import { DiffPanel } from '../diff/DiffPanel'
import { Dropdown } from '../components/Dropdown'

// Local "changes" view for a session, across every repo it touched (cross-repo).
// Defaults to branch mode so committed feature-branch work shows up.
export function SessionDiffModal({
  repos,
  title,
  onClose
}: {
  repos: { name: string; path: string }[]
  title: string
  onClose: () => void
}) {
  const [path, setPath] = useState(repos[0]?.path ?? '')
  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal diff-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Changes · {title}</span>
          {repos.length > 1 && (
            <Dropdown
              className="diff-repo-dd"
              value={path}
              options={repos.map((r) => ({ value: r.path, label: r.name }))}
              onChange={setPath}
              minWidth={180}
            />
          )}
          <button className="term-act" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <Icon name="close" size={13} />
          </button>
        </div>
        <div className="diff-modal-body">
          {path ? (
            <DiffPanel key={path} path={path} initialBranchMode />
          ) : (
            <div className="gh-state">No changed repos detected for this session.</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
