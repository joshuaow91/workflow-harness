import { useState } from 'react'
import { createPortal } from 'react-dom'
import { marked } from 'marked'
import type { GreptileThread } from '@shared/types'

export function GreptileModal({
  repo,
  number,
  confidence,
  summary,
  threads: initial,
  onClose
}: {
  repo: string
  number: number
  confidence: number | null
  summary: string
  threads: GreptileThread[]
  onClose: () => void
}) {
  const [threads, setThreads] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)

  const resolve = async (t: GreptileThread): Promise<void> => {
    setBusy(t.id)
    try {
      await window.api.github.resolveThread(t.id)
      setThreads((ts) => ts.map((x) => (x.id === t.id ? { ...x, isResolved: true } : x)))
    } catch (e) {
      window.alert(`Couldn’t resolve:\n${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const defer = async (t: GreptileThread): Promise<void> => {
    setBusy(t.id)
    try {
      await window.api.github.deferThread(repo, number, t.id, t.replyToId)
      setThreads((ts) => ts.map((x) => (x.id === t.id ? { ...x, isResolved: true } : x)))
    } catch (e) {
      window.alert(`Couldn’t defer:\n${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal greptile-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">
            Greptile · {repo.split('/')[1]} #{number} · {threads.length} thread
            {threads.length === 1 ? '' : 's'}
          </span>
          <button className="term-act" style={{ marginLeft: 'auto' }} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body greptile-modal-body">
          {confidence != null && (
            <div className={`greptile-confidence s${confidence}`}>
              <div className="greptile-confidence-score">Confidence {confidence}/5</div>
              {summary && <div className="greptile-confidence-summary">{summary}</div>}
            </div>
          )}
          {threads.map((t) => {
            const c = t.comments[0]
            return (
              <div key={t.id} className={`greptile-card${t.isResolved ? ' resolved' : ''}`}>
                <div className="greptile-card-head">
                  <span className="greptile-card-author">{c?.author ?? 'greptile'}</span>
                  {c?.path && (
                    <span className="greptile-card-loc">
                      {c.path}
                      {c.line != null ? `:${c.line}` : ''}
                    </span>
                  )}
                  {c?.url && (
                    <button className="greptile-card-open" onClick={() => void window.api.system.openExternal(c.url)}>
                      open ↗
                    </button>
                  )}
                </div>
                {t.comments.map((cm, i) => (
                  <div
                    key={i}
                    className="greptile-card-body md-body"
                    dangerouslySetInnerHTML={{ __html: marked.parse(cm.body || '', { async: false }) as string }}
                  />
                ))}
                <div className="greptile-card-actions">
                  {t.isResolved ? (
                    <span className="greptile-resolved-tag">✓ resolved</span>
                  ) : (
                    <>
                      <button className="tbtn" disabled={busy === t.id} onClick={() => void resolve(t)}>
                        Resolve
                      </button>
                      <button className="tbtn" disabled={busy === t.id} onClick={() => void defer(t)}>
                        Defer
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}
