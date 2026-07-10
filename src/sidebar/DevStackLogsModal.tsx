import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'

// Read-only tail of a dev stack's output, so a failed start (port busy, build
// error) is debuggable without leaving the harness. Polls while open.
export function DevStackLogsModal({
  repo,
  onClose
}: {
  repo: string
  onClose: () => void
}) {
  const [log, setLog] = useState('')
  const bodyRef = useRef<HTMLPreElement>(null)
  const pinned = useRef(true)

  useEffect(() => {
    let active = true
    const load = (): void => {
      void window.api.devstack.logs(repo).then((l) => active && setLog(l))
    }
    load()
    const iv = setInterval(load, 1000)
    return () => {
      active = false
      clearInterval(iv)
    }
  }, [repo])

  // Keep pinned to the bottom unless the user scrolled up.
  useEffect(() => {
    const el = bodyRef.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [log])

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal devstack-logs" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="branch-modal-title">
            Dev stack — <strong>{repo}</strong>
          </span>
          <button className="term-act" title="Close" onClick={onClose}>
            <Icon name="close" size={13} />
          </button>
        </div>
        <pre
          ref={bodyRef}
          className="devstack-log-body"
          onScroll={(e) => {
            const el = e.currentTarget
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          }}
        >
          {log || 'No output yet…'}
        </pre>
      </div>
    </div>
  )
}
