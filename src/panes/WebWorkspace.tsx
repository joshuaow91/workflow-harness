import { useEffect, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { TerminalSpawnOptions } from '@shared/types'
import { useFlatSessions } from '../sidebar/useFlatSessions'
import { DevToolsPane } from './DevToolsPane'
import { TerminalPane } from './TerminalPane'
import { WebFrame } from './WebFrame'

const NEW_TAB_URL = 'https://github.com'

interface Tab {
  id: number
  url: string
  title: string
}
interface SidePane {
  id: number
  kind: 'terminal' | 'browser'
}

// ---- Right-sidebar terminal with a session picker ----

function SideTerminal({ onClose }: { onClose: () => void }) {
  const sessions = useFlatSessions()
  const [opts, setOpts] = useState<TerminalSpawnOptions | null>(null)
  const [mountKey, setMountKey] = useState(0)

  const launch = (next: TerminalSpawnOptions): void => {
    setOpts(next)
    setMountKey((k) => k + 1)
  }

  const onSelect = (value: string): void => {
    const home = window.api.system.homeDir
    if (value === '__shell') launch({ cwd: home })
    else if (value === '__claude') launch({ cwd: home, initialCommand: 'claude' })
    else {
      const s = sessions.find((x) => x.sessionId === value)
      if (s) launch({ cwd: s.cwd, initialCommand: `claude --resume ${s.sessionId}`, label: s.title })
    }
  }

  return (
    <div className="side-term">
      <div className="side-term-head">
        <select className="gh-select" value="" onChange={(e) => onSelect(e.target.value)}>
          <option value="" disabled>
            {opts ? opts.label ?? 'session…' : 'Pick a session…'}
          </option>
          <option value="__claude">＋ new claude (home)</option>
          <option value="__shell">＋ shell</option>
          {sessions.slice(0, 40).map((s) => (
            <option key={s.sessionId} value={s.sessionId}>
              {s.live ? '● ' : ''}
              {s.projectName} — {s.title}
            </option>
          ))}
        </select>
        <button className="term-act" title="Close pane" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="side-term-body">
        {opts ? (
          <TerminalPane key={mountKey} opts={opts} />
        ) : (
          <div className="side-term-hint">Pick a session to resume, or start a new claude.</div>
        )}
      </div>
    </div>
  )
}

// ---- Workspace ----

export function WebWorkspace() {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, url: NEW_TAB_URL, title: 'New Tab' }])
  const [activeTab, setActiveTab] = useState(1)
  const [sidePanes, setSidePanes] = useState<SidePane[]>([])
  const [showDevtools, setShowDevtools] = useState(true)
  const tabCounter = useRef(2)
  const sideCounter = useRef(1)

  const [activeWC, setActiveWC] = useState<number | null>(null)
  const [devtoolsWC, setDevtoolsWC] = useState<number | null>(null)
  const prevTarget = useRef<number | null>(null)

  // Wire the active browser's DevTools into the bottom pane.
  useEffect(() => {
    if (!showDevtools || activeWC == null || devtoolsWC == null) return
    if (prevTarget.current != null && prevTarget.current !== activeWC) {
      void window.api.devtools.detach(prevTarget.current)
    }
    void window.api.devtools.attach(activeWC, devtoolsWC)
    prevTarget.current = activeWC
  }, [activeWC, devtoolsWC, showDevtools])

  const toggleDevtools = (): void => {
    setShowDevtools((v) => {
      if (v && prevTarget.current != null) {
        void window.api.devtools.detach(prevTarget.current)
        prevTarget.current = null
      }
      return !v
    })
  }

  const addTab = (): void => {
    const id = tabCounter.current++
    setTabs((t) => [...t, { id, url: NEW_TAB_URL, title: 'New Tab' }])
    setActiveTab(id)
  }
  const closeTab = (id: number): void => {
    setTabs((t) => {
      const next = t.filter((x) => x.id !== id)
      if (id === activeTab && next.length) setActiveTab(next[next.length - 1].id)
      return next
    })
  }
  const setTabTitle = (id: number, title: string): void =>
    setTabs((t) => t.map((x) => (x.id === id ? { ...x, title } : x)))

  const addSide = (kind: 'terminal' | 'browser'): void =>
    setSidePanes((p) => [...p, { id: sideCounter.current++, kind }])
  const closeSide = (id: number): void => setSidePanes((p) => p.filter((x) => x.id !== id))

  return (
    <div className="workspace">
      <PanelGroup direction="horizontal" className="ws-root" autoSaveId="ws-h">
        <Panel defaultSize={72} minSize={32}>
          <div className="ws-primary">
            <div className="ws-tabstrip">
              {tabs.map((t) => (
                <div
                  key={t.id}
                  className={`ws-tab${t.id === activeTab ? ' active' : ''}`}
                  onClick={() => setActiveTab(t.id)}
                  title={t.url}
                >
                  <span className="ws-tab-title">{t.title || 'New Tab'}</span>
                  <button
                    className="ws-tab-x"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(t.id)
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button className="ws-tab-add" onClick={addTab} title="New tab">
                ＋
              </button>
              <button
                className={`ws-dt-toggle${showDevtools ? ' on' : ''}`}
                onClick={toggleDevtools}
                title="Toggle DevTools"
              >
                ⌥ DevTools
              </button>
            </div>

            <PanelGroup direction="vertical" className="ws-vert" autoSaveId="ws-v">
              <Panel defaultSize={68} minSize={20}>
                <div className="ws-browser-stack">
                  {tabs.length === 0 ? (
                    <div className="side-term-hint" style={{ padding: 24 }}>
                      No tabs. Press ＋ to open one.
                    </div>
                  ) : (
                    tabs.map((t) => (
                      <div
                        key={t.id}
                        className="ws-tab-layer"
                        style={{ display: t.id === activeTab ? 'block' : 'none' }}
                      >
                        <WebFrame
                          src={t.url}
                          onActivate={setActiveWC}
                          onTitle={(title) => setTabTitle(t.id, title)}
                        />
                      </div>
                    ))
                  )}
                </div>
              </Panel>
              {showDevtools && (
                <>
                  <PanelResizeHandle className="resize-handle" />
                  <Panel defaultSize={32} minSize={10}>
                    <DevToolsPane onReady={setDevtoolsWC} />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </div>
        </Panel>

        <PanelResizeHandle className="resize-handle" />

        <Panel defaultSize={28} minSize={14}>
          <div className="ws-side">
            <div className="ws-side-toolbar">
              <button className="tbtn" onClick={() => addSide('terminal')}>
                ＋ claude
              </button>
              <button className="tbtn" onClick={() => addSide('browser')}>
                ＋ browser
              </button>
            </div>
            {sidePanes.length === 0 ? (
              <div className="side-term-hint" style={{ padding: 16 }}>
                Add a claude terminal or a second browser. Split up/down by adding more.
              </div>
            ) : (
              <PanelGroup direction="vertical" className="ws-side-group">
                {sidePanes.map((p, i) => (
                  <SidePaneFragment
                    key={p.id}
                    first={i === 0}
                    pane={p}
                    onActivate={setActiveWC}
                    onClose={() => closeSide(p.id)}
                  />
                ))}
              </PanelGroup>
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}

function SidePaneFragment({
  pane,
  first,
  onActivate,
  onClose
}: {
  pane: SidePane
  first: boolean
  onActivate: (wc: number) => void
  onClose: () => void
}) {
  return (
    <>
      {!first && <PanelResizeHandle className="resize-handle" />}
      <Panel minSize={12}>
        {pane.kind === 'terminal' ? (
          <SideTerminal onClose={onClose} />
        ) : (
          <div className="side-browser">
            <WebFrame src="https://github.com" onActivate={onActivate} />
            <button className="side-browser-close term-act" title="Close" onClick={onClose}>
              ✕
            </button>
          </div>
        )}
      </Panel>
    </>
  )
}
