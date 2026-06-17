import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { AgentActivity } from '@shared/types'
import { browserRouter } from '../lib/browserRouter'
import { settingsStore, useSettings } from '../lib/settingsStore'
import { useAgentInfo } from '../lib/useAgentInfo'
import { DevToolsPane } from './DevToolsPane'
import { SideTerminal } from './SideTerminal'
import { BrowserView } from './BrowserView'

const FALLBACK_URL = 'https://github.com'

interface Tab {
  id: number
  url: string
  title: string
  favicon?: string
  loading?: boolean
}
interface SidePane {
  id: number
  kind: 'terminal' | 'browser'
}

// ---- Workspace ----

export function WebWorkspace() {
  const settings = useSettings()
  const agent = useAgentInfo()
  const defaultUrl = settings?.defaultBrowserUrl ?? FALLBACK_URL
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTab, setActiveTab] = useState(0)
  const [sidePanes, setSidePanes] = useState<SidePane[]>([])
  // DevTools and the side panel start closed — they're opt-in via the toolbar.
  const [bottom, setBottom] = useState<'devtools' | 'activity' | null>(null)
  const [showSide, setShowSide] = useState(false)
  const tabCounter = useRef(1)
  const sideCounter = useRef(1)
  const didInit = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Agent: the focused browser is what Claude drives. Every tab is agent-aware.
  const [activity, setActivity] = useState<AgentActivity[]>([])
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [acting, setActing] = useState(false)
  const actTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(
    () =>
      window.api.agent.onActivity((a) => {
        setActivity((p) => [...p.slice(-250), a])
        setActing(true)
        if (actTimer.current) clearTimeout(actTimer.current)
        actTimer.current = setTimeout(() => setActing(false), 4000)
      }),
    []
  )
  useEffect(() => {
    void window.api.agent.checkConnected().then(setConnected)
  }, [])
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [activity])

  const connect = async (): Promise<void> => {
    setConnecting(true)
    const r = await window.api.agent.connectClaude()
    setConnected(r.ok)
    setConnecting(false)
  }

  // Restore the previously-open tabs once settings load (else open one default).
  useEffect(() => {
    if (settings && !didInit.current) {
      didInit.current = true
      let restored: { url: string; title: string }[] = []
      try {
        restored = JSON.parse(localStorage.getItem('harness:wsTabs') || '[]')
      } catch {
        /* ignore */
      }
      const built = (restored.length ? restored : [{ url: settings.defaultBrowserUrl, title: 'New Tab' }]).map(
        (r) => ({ id: tabCounter.current++, url: r.url, title: r.title || 'New Tab' })
      )
      setTabs(built)
      setActiveTab(built[0].id)
    }
  }, [settings])

  // Persist open tabs (their last URL/title) so they come back on restart.
  useEffect(() => {
    if (!didInit.current) return
    localStorage.setItem('harness:wsTabs', JSON.stringify(tabs.map((t) => ({ url: t.url, title: t.title }))))
  }, [tabs])

  const [activeWC, setActiveWC] = useState<number | null>(null)
  const [devtoolsWC, setDevtoolsWC] = useState<number | null>(null)
  const prevTarget = useRef<number | null>(null)
  const tabWc = useRef<Record<number, number>>({})

  // The focused browser becomes the agent target Claude drives.
  useEffect(() => {
    if (activeWC != null) void window.api.agent.setTarget(activeWC)
  }, [activeWC])

  // Wire the active browser's DevTools into the bottom pane.
  useEffect(() => {
    if (bottom !== 'devtools' || activeWC == null || devtoolsWC == null) return
    if (prevTarget.current != null && prevTarget.current !== activeWC) {
      void window.api.devtools.detach(prevTarget.current)
    }
    void window.api.devtools.attach(activeWC, devtoolsWC)
    prevTarget.current = activeWC
  }, [activeWC, devtoolsWC, bottom])

  const setBottomView = (v: 'devtools' | 'activity' | null): void => {
    if (bottom === 'devtools' && v !== 'devtools' && prevTarget.current != null) {
      void window.api.devtools.detach(prevTarget.current)
      prevTarget.current = null
    }
    setBottom(v)
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

  // Fallback target for "open link in new tab" when no specific view owns the
  // source webview (e.g. links from the workspace's own tabs).
  useEffect(() => {
    return browserRouter.setFallback({
      ownsWc: () => false,
      addTab: (url) => {
        const id = tabCounter.current++
        setTabs((t) => [...t, { id, url, title: 'New Tab' }])
        setActiveTab(id)
      }
    })
  }, [])
  const closeTab = (id: number): void => {
    delete tabWc.current[id]
    void window.api.browserView.destroy(`ws-tab-${id}`)
    setTabs((t) => {
      const next = t.filter((x) => x.id !== id)
      if (id === activeTab && next.length) selectTab(next[next.length - 1].id)
      return next
    })
  }
  const setTabTitle = (id: number, title: string): void =>
    setTabs((t) => t.map((x) => (x.id === id ? { ...x, title } : x)))
  const setTabUrl = (id: number, url: string): void =>
    setTabs((t) => t.map((x) => (x.id === id ? { ...x, url } : x)))
  const setTabFavicon = (id: number, favicon?: string): void =>
    setTabs((t) => t.map((x) => (x.id === id ? { ...x, favicon } : x)))
  const setTabLoading = (id: number, loading: boolean): void =>
    setTabs((t) => t.map((x) => (x.id === id ? { ...x, loading } : x)))

  // ⌘T / ⌘W forwarded from a focused page (or pressed in the DOM): new/close tab.
  useEffect(() => {
    const offShortcut = window.api.browserView.onShortcut((s) => {
      if (!s.id.startsWith('ws-tab-')) return
      if (s.action === 'newTab') addTab()
      else if (s.action === 'closeTab') closeTab(Number(s.id.slice('ws-tab-'.length)))
    })
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return
      // Only when the Browser workspace is the visible app tab (offsetParent is
      // null under display:none) — don't hijack ⌘T/⌘W on the Terminals tab.
      if (!rootRef.current || rootRef.current.offsetParent === null) return
      const k = e.key.toLowerCase()
      if (k === 't') {
        e.preventDefault()
        addTab()
      } else if (k === 'w' && tabs.length) {
        e.preventDefault()
        closeTab(activeTab)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      offShortcut()
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tabs.length])

  const openBookmark = (url: string, title: string): void => {
    const id = tabCounter.current++
    setTabs((t) => [...t, { id, url, title }])
    setActiveTab(id)
  }
  const bookmarks = settings?.bookmarks ?? []
  const addBookmark = (): void => {
    const cur = tabs.find((t) => t.id === activeTab)
    if (!cur || bookmarks.some((b) => b.url === cur.url)) return
    void settingsStore.update({ bookmarks: [...bookmarks, { url: cur.url, title: cur.title || cur.url }] })
  }
  const removeBookmark = (url: string): void =>
    void settingsStore.update({ bookmarks: bookmarks.filter((b) => b.url !== url) })

  const addSide = (kind: SidePane['kind']): void =>
    setSidePanes((p) => [...p, { id: sideCounter.current++, kind }])
  const closeSide = (id: number): void => {
    void window.api.browserView.destroy(`ws-side-${id}`) // no-op if it was a terminal pane
    setSidePanes((p) => p.filter((x) => x.id !== id))
  }

  return (
    <div className="workspace" ref={rootRef}>
      <PanelGroup direction="horizontal" className="ws-root" autoSaveId="ws-h">
        <Panel defaultSize={72} minSize={32}>
          <div className="ws-primary">
            <div className="ws-bookmarks">
              {bookmarks.map((b) => (
                <button
                  key={b.url}
                  className="ws-bm"
                  title={`${b.url}\n(right-click to remove)`}
                  onClick={() => openBookmark(b.url, b.title)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    removeBookmark(b.url)
                  }}
                >
                  {b.title || b.url}
                </button>
              ))}
              <button className="ws-bm add" onClick={addBookmark} title="Bookmark current tab">
                ★
              </button>
            </div>
            <div className="ws-tabstrip">
              {tabs.map((t) => (
                <div
                  key={t.id}
                  className={`ws-tab${t.id === activeTab ? ' active' : ''}`}
                  onClick={() => selectTab(t.id)}
                  onAuxClick={(e) => {
                    if (e.button === 1) {
                      e.preventDefault()
                      closeTab(t.id)
                    }
                  }}
                  title={t.url}
                >
                  {t.loading ? (
                    <span className="ws-tab-spinner" />
                  ) : t.favicon ? (
                    <img className="ws-tab-favicon" src={t.favicon} alt="" />
                  ) : (
                    <span className="ws-tab-favicon ws-tab-favicon-blank" />
                  )}
                  <span className="ws-tab-title">{t.title || 'New Tab'}</span>
                  <button
                    className="ws-tab-x"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(t.id)
                    }}
                  >
                    <Icon name="close" size={13} />
                  </button>
                </div>
              ))}
              <button className="ws-tab-add" onClick={addTab} title="New tab">
                ＋
              </button>
              <span className={`agent-pill${acting ? ' live' : ''}`} style={{ marginLeft: 'auto' }}>
                <span className="agent-dot" />
                {acting ? `${agent.label} acting` : 'agent idle'}
              </span>
              <button
                className={`tbtn${connected ? ' connected' : ''}`}
                onClick={connect}
                disabled={connecting}
                title={connected ? `MCP registered — ${agent.label} can drive any tab` : `Register the agent-browser MCP with ${agent.label}`}
              >
                {connecting ? 'Connecting…' : connected ? `✓ ${agent.label}` : `Connect ${agent.label}`}
              </button>
              <div className="ws-tools">
                <button
                  className={`ws-tool${bottom === 'activity' ? ' on' : ''}`}
                  onClick={() => setBottomView(bottom === 'activity' ? null : 'activity')}
                  title="Agent activity log"
                >
                  <Icon name="activity" size={15} />
                </button>
                <button
                  className={`ws-tool${bottom === 'devtools' ? ' on' : ''}`}
                  onClick={() => setBottomView(bottom === 'devtools' ? null : 'devtools')}
                  title="Toggle DevTools"
                >
                  <Icon name="code" size={15} />
                </button>
                <button
                  className={`ws-tool${showSide ? ' on' : ''}`}
                  onClick={() => setShowSide((v) => !v)}
                  title="Toggle side panel"
                >
                  <Icon name="sidebar" size={15} />
                </button>
              </div>
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
                        <BrowserView
                          viewId={`ws-tab-${t.id}`}
                          src={t.url}
                          onActivate={(wc) => {
                            tabWc.current[t.id] = wc
                            setActiveWC(wc)
                          }}
                          onTitle={(title) => setTabTitle(t.id, title)}
                          onUrl={(url) => setTabUrl(t.id, url)}
                          onFavicon={(f) => setTabFavicon(t.id, f)}
                          onLoading={(l) => setTabLoading(t.id, l)}
                        />
                      </div>
                    ))
                  )}
                </div>
              </Panel>
              {bottom && (
                <>
                  <PanelResizeHandle className="resize-handle" />
                  <Panel defaultSize={32} minSize={10}>
                    {bottom === 'devtools' ? (
                      <DevToolsPane onReady={setDevtoolsWC} />
                    ) : (
                      <div className="agent-log">
                        <div className="agent-log-head">Agent activity</div>
                        <div className="agent-log-body" ref={logRef}>
                          {activity.length === 0 ? (
                            <div className="side-term-hint">
                              Connect Claude, then ask it to drive any browser tab. Its actions appear
                              here.
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
                    )}
                  </Panel>
                </>
              )}
            </PanelGroup>
          </div>
        </Panel>

        {showSide && <PanelResizeHandle className="resize-handle" />}

        {showSide && (
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
                    browserUrl={defaultUrl}
                    onActivate={setActiveWC}
                    onClose={() => closeSide(p.id)}
                  />
                ))}
              </PanelGroup>
            )}
          </div>
        </Panel>
        )}
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
        ) : (
          <div className="side-browser">
            <BrowserView
              viewId={`ws-side-${pane.id}`}
              src={browserUrl}
              onActivate={onActivate}
              leftSlot={
                <button className="nav-btn" title="Close" onClick={onClose}>
                  <Icon name="close" size={13} />
                </button>
              }
            />
          </div>
        )}
      </Panel>
    </>
  )
}
