import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { createPortal } from 'react-dom'
import { marked } from 'marked'

export function PlanModal({ sessionId, onClose }: { sessionId?: string; onClose: () => void }) {
  const [plan, setPlan] = useState<string | null>(null)
  useEffect(() => {
    if (sessionId) void window.api.claude.sessionPlan(sessionId).then(setPlan)
  }, [sessionId])

  const planHtml = useMemo(
    () => (plan ? (marked.parse(plan, { gfm: true, async: false }) as string) : ''),
    [plan]
  )

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal plan-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Plan</span>
          <button className="term-act" onClick={onClose}>
            <Icon name="close" size={13} />
          </button>
        </div>
        <div className="modal-body">
          {planHtml ? (
            <div className="plan-md obs-md" dangerouslySetInnerHTML={{ __html: planHtml }} />
          ) : (
            <div className="term-sb-empty">
              {plan === null ? 'Loading…' : 'No plan recorded for this session.'}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
