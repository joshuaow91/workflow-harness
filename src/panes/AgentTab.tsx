import { useEffect, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { AgentActivity } from '@shared/types'
import { SideTerminal } from './SideTerminal'
import { WebFrame } from './WebFrame'

export function AgentTab() {
  const [activity, setActivity] = useState<AgentActivity[]>([])
  const [connectMsg, setConnectMsg] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [active, setActive] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const activeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return window.api.agent.onActivity((a) => {
      setActivity((prev) => [...prev.slice(-250), a])
      setActive(true)
      if (activeTimer.current) clearTimeout(activeTimer.current)
      activeTimer.current = setTimeout(() => setActive(false), 4000)
    })
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [activity])

  // Reflect existing registration on load.
  useEffect(() => {
    void window.api.agent.checkConnected().then(setConnected)
  }, [])

  const connect = async (): Promise<void> => {
    setConnecting(true)
    const r = await window.api.agent.connectClaude()
    setConnectMsg(r.message)
    setConnected(r.ok)
    setConnecting(false)
  }

  return (
    <div className="agent-tab">
      <PanelGroup direction="horizontal" autoSaveId="agent-h">
        <Panel defaultSize={40} minSize={20}>
          <SideTerminal />
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel defaultSize={60} minSize={30}>
          <div className="agent-col">
            <div className="agent-statusbar">
              <span className="agent-tag">🤖 Agent browser</span>
              <span className={`agent-pill${active ? ' live' : ''}`}>
                <span className="agent-dot" />
                {active ? 'Claude acting' : 'idle'}
              </span>
              <button
                className={`tbtn${connected ? ' connected' : ''}`}
                style={{ marginLeft: 'auto' }}
                onClick={connect}
                disabled={connecting}
                title={connected ? 'MCP registered — click to re-register' : 'Register the agent-browser MCP with Claude'}
              >
                {connecting ? 'Connecting…' : connected ? '✓ Connected' : 'Connect Claude'}
              </button>
            </div>
            {connectMsg && <div className="agent-msg">{connectMsg}</div>}
            <PanelGroup direction="vertical" autoSaveId="agent-v" className="agent-vert">
              <Panel defaultSize={68} minSize={20}>
                <div className="agent-frame">
                  <WebFrame
                    src="about:blank"
                    onActivate={(id) => void window.api.agent.setTarget(id)}
                  />
                </div>
              </Panel>
              <PanelResizeHandle className="resize-handle" />
              <Panel defaultSize={32} minSize={10}>
                <div className="agent-log">
                  <div className="agent-log-head">Activity</div>
                  <div className="agent-log-body" ref={logRef}>
                    {activity.length === 0 ? (
                      <div className="side-term-hint">
                        Connect Claude, then ask it to drive the browser. Its actions appear here.
                      </div>
                    ) : (
                      activity.map((a, i) => (
                        <div key={i} className={`agent-log-row${a.ok ? '' : ' err'}`}>
                          <span className="agent-log-tool">{a.tool}</span>
                          <span className="agent-log-detail">{a.detail}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </Panel>
            </PanelGroup>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
