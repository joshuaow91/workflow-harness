import { createPortal } from 'react-dom'
import { marked } from 'marked'
import type { GreptileComment } from '@shared/types'

export function GreptileModal({
  repo,
  number,
  comments,
  onClose
}: {
  repo: string
  number: number
  comments: GreptileComment[]
  onClose: () => void
}) {
  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal greptile-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">
            Greptile · {repo.split('/')[1]} #{number} · {comments.length} comment
            {comments.length === 1 ? '' : 's'}
          </span>
          <button className="term-act" style={{ marginLeft: 'auto' }} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="greptile-modal-body">
          {comments.map((c, i) => (
            <div key={i} className="greptile-card">
              <button className="greptile-card-head" onClick={() => void window.api.system.openExternal(c.url)}>
                <span className="greptile-card-author">{c.author}</span>
                {c.path && (
                  <span className="greptile-card-loc">
                    {c.path}
                    {c.line != null ? `:${c.line}` : ''}
                  </span>
                )}
                <span className="greptile-card-open">open ↗</span>
              </button>
              <div
                className="greptile-card-body md-body"
                dangerouslySetInnerHTML={{ __html: marked.parse(c.body || '', { async: false }) as string }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
