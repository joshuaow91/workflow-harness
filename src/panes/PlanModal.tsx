import { createPortal } from 'react-dom'
import type { SessionTask } from '@shared/types'

export function PlanModal({ tasks, onClose }: { tasks: SessionTask[]; onClose: () => void }) {
  const done = tasks.filter((t) => t.status === 'completed').length
  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal plan-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">
            Plan <span className="term-sb-count">{done}/{tasks.length}</span>
          </span>
          <button className="term-act" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {tasks.length === 0 ? (
            <div className="term-sb-empty">No tasks in this session yet.</div>
          ) : (
            tasks.map((t) => (
              <div key={t.id} className={`plan-task ${t.status}`}>
                <span className="term-task-dot" />
                <div className="plan-task-body">
                  <div className="plan-task-subject">{t.subject}</div>
                  {t.description && <div className="plan-task-desc">{t.description}</div>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
