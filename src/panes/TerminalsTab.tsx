import { useEffect, useRef, useState } from 'react'
import type { TerminalSpawnOptions } from '@shared/types'
import { terminalBus } from '../lib/terminalBus'
import { useDefaultSessionDir } from '../lib/settingsStore'
import { claudeCommand } from '../lib/launchClaude'
import { Icon } from '../components/Icon'
import { PaneGrid, type Layout, type Pane } from './PaneGrid'
import { TermSidebar } from './TermSidebar'

interface Tab {
  id: number
  name: string
  panes: Pane[]
  layout: Layout
  sessionId?: string
}

function basename(p: string): string {
  return p.split('/').filter(Boolean).pop() ?? p
}

const LAYOUTS: { key: Layout; title: string }[] = [
  { key: 'cols', title: 'Columns (side by side)' },
  { key: 'rows', title: 'Rows (stacked)' },
  { key: 'grid', title: 'Grid' },
  { key: 'mainGrid', title: 'Main + grid' }
]

export function TerminalsTab() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [showSidebar, setShowSidebar] = useState(true)
  const tabCounter = useRef(1)
  const paneCounter = useRef(1)
  const defaultDir = useDefaultSessionDir()

  const active = tabs.find((t) => t.id === activeId) ?? null

  const makePane = async (opts: TerminalSpawnOptions): Promise<Pane> => {
    const terminalId = await window.api.terminal.create(opts)
    return { paneId: paneCounter.current++, terminalId, opts }
  }

  // Each opened session becomes its own tab.
  const openTab = async (opts: TerminalSpawnOptions): Promise<void> => {
    const pane = await makePane(opts)
    const m = opts.initialCommand?.match(/--resume\s+(\S+)/)
    const id = tabCounter.current++
    setTabs((t) => [
      ...t,
      { id, name: opts.label ?? basename(opts.cwd), panes: [pane], layout: 'cols', sessionId: m?.[1] }
    ])
    setActiveId(id)
  }
  useEffect(() => terminalBus.subscribe((opts) => void openTab(opts)), [])

  // Refit terminals when the active tab / its layout / pane count changes.
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 60)
    return () => clearTimeout(t)
  }, [activeId, active?.layout, active?.panes.length])

  // A new tab starts a claude session in the configured default directory.
  const newEmptyTab = (): void =>
    void openTab({
      cwd: defaultDir,
      initialCommand: claudeCommand(),
      label: `claude · ${basename(defaultDir)}`
    })

  const splitPane = async (): Promise<void> => {
    if (!active) return newEmptyTab()
    const cwd = active.panes[0]?.opts.cwd ?? defaultDir
    const pane = await makePane({ cwd, label: `shell · ${basename(cwd)}` })
    setTabs((t) => t.map((x) => (x.id === active.id ? { ...x, panes: [...x.panes, pane] } : x)))
  }

  const closePane = (tabId: number, paneId: number): void =>
    setTabs((t) => {
      const tab = t.find((x) => x.id === tabId)
      const pane = tab?.panes.find((p) => p.paneId === paneId)
      if (pane) window.api.terminal.kill(pane.terminalId)
      const panes = (tab?.panes ?? []).filter((p) => p.paneId !== paneId)
      if (panes.length === 0) {
        const remaining = t.filter((x) => x.id !== tabId)
        if (tabId === activeId) setActiveId(remaining.length ? remaining[remaining.length - 1].id : null)
        return remaining
      }
      return t.map((x) => (x.id === tabId ? { ...x, panes } : x))
    })

  const restartPane = async (tabId: number, paneId: number): Promise<void> => {
    const pane = tabs.find((x) => x.id === tabId)?.panes.find((p) => p.paneId === paneId)
    if (!pane) return
    window.api.terminal.kill(pane.terminalId)
    const terminalId = await window.api.terminal.create(pane.opts)
    setTabs((t) =>
      t.map((x) =>
        x.id === tabId
          ? { ...x, panes: x.panes.map((p) => (p.paneId === paneId ? { ...p, terminalId } : p)) }
          : x
      )
    )
  }

  const reorder = (tabId: number, fromId: number, toId: number): void =>
    setTabs((t) =>
      t.map((x) => {
        if (x.id !== tabId) return x
        const ids = x.panes.map((p) => p.paneId)
        const from = ids.indexOf(fromId)
        const to = ids.indexOf(toId)
        if (from < 0 || to < 0) return x
        const panes = [...x.panes]
        const [moved] = panes.splice(from, 1)
        panes.splice(to, 0, moved)
        return { ...x, panes }
      })
    )

  const closeTab = (tabId: number): void =>
    setTabs((t) => {
      t.find((x) => x.id === tabId)?.panes.forEach((p) => window.api.terminal.kill(p.terminalId))
      const remaining = t.filter((x) => x.id !== tabId)
      if (tabId === activeId) setActiveId(remaining.length ? remaining[remaining.length - 1].id : null)
      return remaining
    })

  const setLayout = (tabId: number, layout: Layout): void =>
    setTabs((t) => t.map((x) => (x.id === tabId ? { ...x, layout } : x)))

  const saveRename = (tabId: number): void => {
    const n = draft.trim()
    if (n) setTabs((t) => t.map((x) => (x.id === tabId ? { ...x, name: n } : x)))
    setEditing(null)
  }

  return (
    <div className="terminals">
      <div className="term-tabstrip">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`term-tab${tab.id === activeId ? ' active' : ''}`}
            onClick={() => setActiveId(tab.id)}
            onDoubleClick={() => {
              setDraft(tab.name)
              setEditing(tab.id)
            }}
            title="Double-click to rename"
          >
            {editing === tab.id ? (
              <input
                autoFocus
                className="term-tab-rename"
                value={draft}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => saveRename(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveRename(tab.id)
                  if (e.key === 'Escape') setEditing(null)
                }}
              />
            ) : (
              <span className="term-tab-name">{tab.name}</span>
            )}
            <button
              className="term-tab-x"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <button className="term-tab-add" onClick={newEmptyTab} title="New tab">
          ＋
        </button>
      </div>

      {active ? (
        <>
          <div className="terminals-toolbar">
            <button className="tbtn" onClick={() => void splitPane()}>
              ＋ Split pane
            </button>
            <div className="term-layouts">
              {LAYOUTS.map((l) => (
                <button
                  key={l.key}
                  className={`term-layout${active.layout === l.key ? ' active' : ''}`}
                  title={l.title}
                  onClick={() => setLayout(active.id, l.key)}
                >
                  <Icon name={l.key} size={15} />
                </button>
              ))}
            </div>
            <span className="terminals-hint">
              {active.panes.length} pane{active.panes.length > 1 ? 's' : ''} · drag headers to
              reorder
            </span>
            <button
              className={`tbtn${showSidebar ? ' connected' : ''}`}
              style={{ marginLeft: 'auto' }}
              onClick={() => setShowSidebar((v) => !v)}
              title="Toggle the session progress sidebar"
            >
              ☰ Progress
            </button>
          </div>
          <div className="term-body">
            <div className="term-main">
              <PaneGrid
                panes={active.panes}
                layout={active.layout}
                onClose={(p) => closePane(active.id, p)}
                onRestart={(p) => void restartPane(active.id, p)}
                onReorder={(f, to) => reorder(active.id, f, to)}
              />
            </div>
            {showSidebar && (
              <TermSidebar
                key={active.id}
                sessionId={active.sessionId}
                cwd={active.panes[0]?.opts.cwd}
              />
            )}
          </div>
        </>
      ) : (
        <div className="placeholder">
          <div className="ph-emoji">⌨️</div>
          <div className="ph-title">No terminals open</div>
          <div className="ph-sub">
            Click a session in the sidebar to open it as a tab, or press ＋ for a new shell. Split a
            tab into panes with “Split pane”.
          </div>
        </div>
      )}
    </div>
  )
}
