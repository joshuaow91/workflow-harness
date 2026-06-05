import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { marked } from 'marked'
import type { SessionTask } from '@shared/types'

export function PlanModal({
  sessionId,
  tasks,
  onClose
}: {
  sessionId?: string
  tasks: SessionTask[]
  onClose: () => void
}) {
  const [plan, setPlan] = useState('')
  useEffect(() => {
    if (sessionId) void window.api.claude.sessionPlan(sessionId).then(setPlan)
  }, [sessionId])

  const planHtml = useMemo(
    () => (plan ? (marked.parse(plan, { gfm: true, async: false }) as string) : ''),
    [plan]
  )
  const done = tasks.filter((t) => t.status === 'completed').length

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal plan-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">
            Plan
            {tasks.length > 0 && (
              <span className="term-sb-count">
                {done}/{tasks.length}
              </span>
            )}
          </span>
          <button className="term-act" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {planHtml ? (
            <div className="plan-md obs-md" dangerouslySetInnerHTML={{ __html: planHtml }} />
          ) : (
            !tasks.length && <div className="term-sb-empty">No plan recorded for this session.</div>
          )}

          {tasks.length > 0 && (
            <div className="plan-tasklist">
              <div className="plan-tasklist-title">Task progress</div>
              {tasks.map((t) => (
                <div key={t.id} className={`plan-task ${t.status}`}>
                  <span className="term-task-dot" />
                  <div className="plan-task-body">
                    <div className="plan-task-subject">{t.subject}</div>
                    {t.description && <div className="plan-task-desc">{t.description}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
