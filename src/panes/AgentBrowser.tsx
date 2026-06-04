import { useEffect, useRef, useState } from 'react'
import { WebFrame } from './WebFrame'

// A browser pane reserved for Claude. It reports its webContents id as the
// control target so the MCP server drives THIS view (not your manual tabs).
export function AgentBrowser({ onClose }: { onClose: () => void }) {
  const wc = useRef<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    return () => {
      void window.api.agent.setTarget(null)
    }
  }, [])

  const connect = async (): Promise<void> => {
    setConnecting(true)
    const r = await window.api.agent.connectClaude()
    setMsg(r.message)
    setConnecting(false)
  }

  return (
    <div className="agent-pane">
      <div className="agent-bar">
        <span className="agent-tag">🤖 Agent browser</span>
        <button className="tbtn" onClick={connect} disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect Claude'}
        </button>
        <button className="term-act" title="Close" style={{ marginLeft: 'auto' }} onClick={onClose}>
          ✕
        </button>
      </div>
      {msg && <div className="agent-msg">{msg}</div>}
      <div className="agent-frame">
        <WebFrame
          src="about:blank"
          onActivate={(id) => {
            wc.current = id
            void window.api.agent.setTarget(id)
          }}
        />
      </div>
    </div>
  )
}
