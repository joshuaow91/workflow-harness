import { createPortal } from 'react-dom'
import { diffBus } from '../lib/diffBus'
import { DiffPanel } from './DiffPanel'

export function DiffModal({
  path,
  title,
  onClose
}: {
  path: string
  title: string
  onClose: () => void
}) {
  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal diff-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Changes · {title}</span>
          <button
            className="tbtn"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              diffBus.openTab(path)
              onClose()
            }}
          >
            Open in Changes tab ↗
          </button>
          <button className="term-act" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="diff-modal-body">
          <DiffPanel path={path} />
        </div>
      </div>
    </div>,
    document.body
  )
}
