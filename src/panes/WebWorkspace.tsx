import { useEffect, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { TerminalSpawnOptions } from '@shared/types'
import { useFlatSessions } from '../sidebar/useFlatSessions'
import { browserBus } from '../lib/browserBus'
import { useDefaultSessionDir, useSettings } from '../lib/settingsStore'
import { Dropdown, type DropdownOption } from '../components/Dropdown'
import { AgentBrowser } from './AgentBrowser'
import { DevToolsPane } from './DevToolsPane'
import { TerminalPane } from './TerminalPane'
import { WebFrame } from './WebFrame'

const FALLBACK_URL = 'https://github.com'

interface Tab {
  id: number
  url: string
  title: string
}
interface SidePane {
  id: number
  kind: 'terminal' | 'browser' | 'agent'
}

// ---- Right-sidebar terminal with a session picker ----

function basename(p: string): string {
  return p.split('/').filter(Boolean).pop() ?? p
}

function SideTerminal({ onClose }: { onClose: () => void }) {
  const sessions = useFlatSessions()
  const defaultDir = useDefaultSessionDir()
  const [opts, setOpts] = useState<TerminalSpawnOptions | null>(null)
  const [mountKey, setMountKey] = useState(0)

  const launch = (next: TerminalSpawnOptions): void => {
    setOpts(next)
    setMountKey((k) => k + 1)
  }

  const onSelect = (value: string): void => {
    if (value === '__shell') launch({ cwd: defaultDir, label: `shell · ${basename(defaultDir)}` })
    else if (value === '__claude')
      launch({ cwd: defaultDir, initialCommand: 'claude', label: `claude · ${basename(defaultDir)}` })
    else {
      const s = sessions.find((x) => x.sessionId === value)
      if (s) launch({ cwd: s.cwd, initialCommand: `claude --resume ${s.sessionId}`, label: s.title })
    }
  }

  const dirName = basename(defaultDir)
  const options: DropdownOption[] = [
    { value: '__claude', label: `＋ new claude`, sublabel: dirName },
    { value: '__shell', label: `＋ shell`, sublabel: dirName },
    ...sessions.slice(0, 60).map((s) => ({
      value: s.sessionId,
      label: `${s.live ? '● ' : ''}${s.title}`,
      sublabel: s.projectName
    }))
  ]

  return (
    <div className="side-term">
      <div className="side-term-head">
        <Dropdown
          value=""
          triggerLabel={opts?.label ?? 'Pick a session…'}
          options={options}
          onChange={onSelect}
          searchable
          minWidth={240}
        />
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
  const settings = useSettings()
  const defaultUrl = settings?.defaultBrowserUrl ?? FALLBACK_URL
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTab, setActiveTab] = useState(0)
  const [sidePanes, setSidePanes] = useState<SidePane[]>([])
  const [showDevtools, setShowDevtools] = useState(true)
  const tabCounter = useRef(1)
  const sideCounter = useRef(1)
  const didInit = useRef(false)

  // Open the first tab at the configured default once settings load.
  useEffect(() => {
    if (settings && !didInit.current) {
      didInit.current = true
      const id = tabCounter.current++
      setTabs([{ id, url: settings.defaultBrowserUrl, title: 'New Tab' }])
      setActiveTab(id)
    }
  }, [settings])

  const [activeWC, setActiveWC] = useState<number | null>(null)
  const [devtoolsWC, setDevtoolsWC] = useState<number | null>(null)
  const prevTarget = useRef<number | null>(null)
  const tabWc = useRef<Record<number, number>>({})

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

  // Select a tab and point DevTools at that tab's browser (if known yet).
  const selectTab = (id: number): void => {
    setActiveTab(id)
    const wc = tabWc.current[id]
    if (wc != null) setActiveWC(wc)
  }

  const addTab = (): void => {
    const id = tabCounter.current++
    setTabs((t) => [...t, { id, url: defaultUrl, title: 'New Tab' }])
    setActiveTab(id)
  }

  // "Open link in new tab" from any embedded webview lands here.
  useEffect(() => {
    return browserBus.subscribe((url) => {
      const id = tabCounter.current++
      setTabs((t) => [...t, { id, url, title: 'New Tab' }])
      setActiveTab(id)
    })
  }, [])
  const closeTab = (id: number): void => {
    delete tabWc.current[id]
    setTabs((t) => {
      const next = t.filter((x) => x.id !== id)
      if (id === activeTab && next.length) selectTab(next[next.length - 1].id)
      return next
    })
  }
  const setTabTitle = (id: number, title: string): void =>
    setTabs((t) => t.map((x) => (x.id === id ? { ...x, title } : x)))

  const addSide = (kind: SidePane['kind']): void =>
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
                  onClick={() => selectTab(t.id)}
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
                          onActivate={(wc) => {
                            tabWc.current[t.id] = wc
                            setActiveWC(wc)
                          }}
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
              <button
                className="tbtn"
                onClick={() => addSide('agent')}
                title="A browser pane Claude can drive via MCP"
              >
                🤖 agent
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
                    browserUrl={defaultUrl}
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
  browserUrl,
  onActivate,
  onClose
}: {
  pane: SidePane
  first: boolean
  browserUrl: string
  onActivate: (wc: number) => void
  onClose: () => void
}) {
  return (
    <>
      {!first && <PanelResizeHandle className="resize-handle" />}
      <Panel minSize={12}>
        {pane.kind === 'terminal' ? (
          <SideTerminal onClose={onClose} />
        ) : pane.kind === 'agent' ? (
          <AgentBrowser onClose={onClose} />
        ) : (
          <div className="side-browser">
            <WebFrame src={browserUrl} onActivate={onActivate} />
            <button className="side-browser-close term-act" title="Close" onClick={onClose}>
              ✕
            </button>
          </div>
        )}
      </Panel>
    </>
  )
}
