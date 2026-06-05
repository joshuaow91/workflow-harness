import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SetupCheck } from '@shared/types'

function SetupRow({ c }: { c: SetupCheck }) {
  return (
    <div className="setup-row">
      <span className={`setup-dot ${c.ok ? 'ok' : 'no'}`}>{c.ok ? '✓' : '✕'}</span>
      <div className="setup-row-body">
        <div className="setup-row-name">{c.name}</div>
        <div className="setup-row-detail">{c.detail}</div>
        {!c.ok && c.fix && <code className="setup-fix">{c.fix}</code>}
      </div>
    </div>
  )
}

export function SetupModal({ onClose }: { onClose: () => void }) {
  const [checks, setChecks] = useState<SetupCheck[] | null>(null)
  const load = (): void => {
    setChecks(null)
    void window.api.system.checkSetup().then(setChecks)
  }
  useEffect(load, [])

  const required = checks?.filter((c) => c.required) ?? []
  const optional = checks?.filter((c) => !c.required) ?? []
  const allReqOk = required.length > 0 && required.every((c) => c.ok)

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal setup-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">
            Setup &amp; requirements
            {checks &&
              (allReqOk ? (
                <span className="gh-badge ok">ready</span>
              ) : (
                <span className="gh-badge fail">action needed</span>
              ))}
          </span>
          <button className="term-act" style={{ marginLeft: 'auto' }} onClick={load} title="Re-check">
            ↻
          </button>
          <button className="term-act" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="setup-intro">
            Everything the harness needs to work. Run the fix command shown under any item that isn’t
            satisfied, then hit ↻ to re-check.
          </p>
          {!checks ? (
            <div className="term-sb-empty">Checking your machine…</div>
          ) : (
            <>
              <div className="setup-group-title">Required</div>
              {required.map((c) => (
                <SetupRow key={c.name} c={c} />
              ))}
              <div className="setup-group-title">Optional / per-feature</div>
              {optional.map((c) => (
                <SetupRow key={c.name} c={c} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
