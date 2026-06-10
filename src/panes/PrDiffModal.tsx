import { createPortal } from 'react-dom'
import { useAsync } from '../lib/useAsync'
import { Icon } from '../components/Icon'
import { DiffView } from '../diff/DiffView'

// The full PR diff (gh pr diff) — checkout-independent "all changes" view.
export function PrDiffModal({
  repo,
  number,
  onClose
}: {
  repo: string
  number: number
  onClose: () => void
}) {
  const diff = useAsync(() => window.api.github.prDiff(repo, number), [repo, number])
  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal diff-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">
            PR diff · {repo.split('/')[1]} #{number}
          </span>
          <button className="term-act" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <Icon name="close" size={13} />
          </button>
        </div>
        <div className="diff-modal-body">
          <DiffView text={diff.data ?? ''} loading={diff.loading} />
        </div>
      </div>
    </div>,
    document.body
  )
}
