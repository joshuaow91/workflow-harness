import { createPortal } from 'react-dom'
import { diffBus } from '../lib/diffBus'
import { Icon } from '../components/Icon'
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
            Open in Changes tab <Icon name="external" size={12} />
          </button>
          <button className="term-act" onClick={onClose}>
            <Icon name="close" size={13} />
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
