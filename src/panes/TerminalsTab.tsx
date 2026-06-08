import { useEffect, useRef, useState } from 'react'
import type { TerminalSpawnOptions } from '@shared/types'
import { terminalBus } from '../lib/terminalBus'
import { settingsStore, useDefaultSessionDir } from '../lib/settingsStore'
import { claudeCommand } from '../lib/launchClaude'
import { useAgentInfo } from '../lib/useAgentInfo'
import { sessionAlerts, useSessionAlerts } from '../lib/sessionAlerts'
import { focusTerminal } from '../lib/terminalFocus'
import { useFlatSessions } from '../sidebar/useFlatSessions'
import { Icon } from '../components/Icon'
import { Dropdown, type DropdownOption } from '../components/Dropdown'
import { PaneGrid, type Layout, type Pane } from './PaneGrid'

interface Tab {
  id: number
  name: string
  panes: Pane[]
  layout: Layout
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
  const [tabDrag, setTabDrag] = useState<number | null>(null)
  const [tabOver, setTabOver] = useState<number | null>(null)
  const [focusedPaneId, setFocusedPaneId] = useState<number | null>(null)

  // Rename a pane: relabel it, and persist the session title when it's a session.
  const renamePane = (paneId: number, name: string): void => {
    let sessionId: string | undefined
    setTabs((t) =>
      t.map((tab) => ({
        ...tab,
        panes: tab.panes.map((p) => {
          if (p.paneId !== paneId) return p
          if (p.sessionId) sessionId = p.sessionId
          return { ...p, opts: { ...p.opts, label: name } }
        })
      }))
    )
    if (sessionId) {
      const titles = settingsStore.get()?.sessionTitles ?? {}
      void settingsStore.update({ sessionTitles: { ...titles, [sessionId]: name } })
    }
  }
  const tabCounter = useRef(1)
  const paneCounter = useRef(1)
  const defaultDir = useDefaultSessionDir()
  const sessions = useFlatSessions()
  const agent = useAgentInfo()
  const alerts = useSessionAlerts()

  const active = tabs.find((t) => t.id === activeId) ?? null

  // Move focus to the adjacent pane in a direction (Cmd+Option+Arrow), picking the
  // nearest pane that way by its on-screen rectangle.
  const movePaneFocus = (dir: 'left' | 'right' | 'up' | 'down'): void => {
    if (!active || active.panes.length < 2) return
    const els = Array.from(
      document.querySelectorAll<HTMLElement>('.terminals-grid > .term-panel[data-pane-id]')
    )
    const rects = els.map((el) => ({ id: Number(el.dataset.paneId), r: el.getBoundingClientRect() }))
    const curId = focusedPaneId ?? active.panes[0].paneId
    const cur = rects.find((x) => x.id === curId)
    if (!cur) return
    const cx = cur.r.left + cur.r.width / 2
    const cy = cur.r.top + cur.r.height / 2
    let best: number | null = null
    let bestScore = Infinity
    for (const cand of rects) {
      if (cand.id === curId) continue
      const dx = cand.r.left + cand.r.width / 2 - cx
      const dy = cand.r.top + cand.r.height / 2 - cy
      let inDir = false
      let primary = 0
      let secondary = 0
      if (dir === 'left') (inDir = dx < -5), (primary = -dx), (secondary = Math.abs(dy))
      if (dir === 'right') (inDir = dx > 5), (primary = dx), (secondary = Math.abs(dy))
      if (dir === 'up') (inDir = dy < -5), (primary = -dy), (secondary = Math.abs(dx))
      if (dir === 'down') (inDir = dy > 5), (primary = dy), (secondary = Math.abs(dx))
      if (!inDir) continue
      const score = primary + secondary * 2 // favor panes aligned on the axis
      if (score < bestScore) {
        bestScore = score
        best = cand.id
      }
    }
    if (best == null) return
    setFocusedPaneId(best)
    const pane = active.panes.find((p) => p.paneId === best)
    if (pane) {
      focusTerminal(pane.terminalId)
      if (pane.sessionId) sessionAlerts.clear(pane.sessionId)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey && e.altKey) || e.ctrlKey) return
      const dir = (
        { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as const
      )[e.key]
      if (!dir) return
      e.preventDefault()
      e.stopPropagation()
      movePaneFocus(dir)
    }
    // Capture phase so xterm doesn't consume the combo first.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, focusedPaneId])

  const makePane = async (opts: TerminalSpawnOptions): Promise<Pane> => {
    const terminalId = await window.api.terminal.create(opts)
    const m = opts.initialCommand?.match(/--(?:resume|session-id)\s+(\S+)/)
    return { paneId: paneCounter.current++, terminalId, opts, sessionId: m?.[1] }
  }

  // Each opened session becomes its own tab.
  const openTab = async (opts: TerminalSpawnOptions): Promise<void> => {
    const pane = await makePane(opts)
    const id = tabCounter.current++
    setTabs((t) => [...t, { id, name: opts.label ?? basename(opts.cwd), panes: [pane], layout: 'cols' }])
    setActiveId(id)
  }
  useEffect(() => terminalBus.subscribe((opts) => void openTab(opts)), [])

  // Restore the saved tab/pane/layout on first mount (re-launches each pane's
  // command, e.g. claude --resume <id> or a shell).
  const hydrated = useRef(false)
  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    let saved: { activeIndex?: number; tabs?: { name: string; layout: Layout; panes: TerminalSpawnOptions[] }[] } | null
    try {
      saved = JSON.parse(localStorage.getItem('harness:terminals') || 'null')
    } catch {
      saved = null
    }
    if (!saved?.tabs?.length) return
    void (async () => {
      const rebuilt: Tab[] = []
      for (const st of saved.tabs ?? []) {
        const panes: Pane[] = []
        for (const opts of st.panes) {
          // A saved `--session-id <id>` is a session that now EXISTS — re-running
          // it errors "already in use"; resume it instead.
          const initialCommand = opts.initialCommand?.replace(/--session-id\s+(\S+)/, '--resume $1')
          panes.push(await makePane({ ...opts, initialCommand }))
        }
        rebuilt.push({ id: tabCounter.current++, name: st.name, layout: st.layout, panes })
      }
      if (rebuilt.length) {
        setTabs(rebuilt)
        setActiveId(rebuilt[Math.min(saved!.activeIndex ?? 0, rebuilt.length - 1)].id)
      }
    })()
  }, [])

  // Persist the layout (without runtime ids).
  useEffect(() => {
    try {
      localStorage.setItem(
        'harness:terminals',
        JSON.stringify({
          activeIndex: tabs.findIndex((t) => t.id === activeId),
          tabs: tabs.map((t) => ({ name: t.name, layout: t.layout, panes: t.panes.map((p) => p.opts) }))
        })
      )
    } catch {
      /* ignore */
    }
  }, [tabs, activeId])

  // Refit terminals when the active tab / its layout / pane count changes.
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 60)
    return () => clearTimeout(t)
  }, [activeId, active?.layout, active?.panes.length])

  // A new tab starts an agent session in the configured default directory.
  const newEmptyTab = async (): Promise<void> =>
    void openTab({
      cwd: defaultDir,
      initialCommand: await claudeCommand(),
      label: `${agent.cli} · ${basename(defaultDir)}`
    })

  const splitWith = async (opts: TerminalSpawnOptions): Promise<void> => {
    if (!active) return openTab(opts)
    const pane = await makePane(opts)
    setTabs((t) => t.map((x) => (x.id === active.id ? { ...x, panes: [...x.panes, pane] } : x)))
  }

  const splitCwd = active?.panes[0]?.opts.cwd ?? defaultDir
  const splitOptions: DropdownOption[] = [
    { value: '__claude', label: `＋ new ${agent.cli}`, sublabel: basename(splitCwd) },
    { value: '__shell', label: '＋ shell', sublabel: basename(splitCwd) },
    ...sessions.slice(0, 60).map((s) => ({
      value: s.sessionId,
      label: `${s.live ? '● ' : ''}${s.title}`,
      sublabel: s.projectName
    }))
  ]
  const onSplit = async (value: string): Promise<void> => {
    if (value === '__shell') void splitWith({ cwd: splitCwd, label: `shell · ${basename(splitCwd)}` })
    else if (value === '__claude')
      void splitWith({ cwd: splitCwd, initialCommand: await claudeCommand(), label: `${agent.cli} · ${basename(splitCwd)}` })
    else {
      const s = sessions.find((x) => x.sessionId === value)
      if (s) void splitWith({ cwd: s.cwd, initialCommand: await claudeCommand(s.sessionId), label: s.title })
    }
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

  // Merge one tab's panes into another (drop tab A on tab B).
  const mergeTabs = (fromId: number, toId: number): void => {
    if (fromId === toId) return
    setTabs((t) => {
      const from = t.find((x) => x.id === fromId)
      if (!from) return t
      return t
        .map((x) => {
          if (x.id !== toId) return x
          const panes = [...x.panes, ...from.panes]
          return { ...x, panes, layout: panes.length > 1 ? 'grid' : x.layout }
        })
        .filter((x) => x.id !== fromId)
    })
    setActiveId(toId)
  }

  // Collapse every tab's panes into one grid tab.
  const mergeAll = (): void => {
    if (tabs.length <= 1) return
    const firstId = tabs[0].id
    setTabs((t) => (t.length <= 1 ? t : [{ ...t[0], panes: t.flatMap((x) => x.panes), layout: 'grid' }]))
    setActiveId(firstId)
  }

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
            className={`term-tab${tab.id === activeId ? ' active' : ''}${tabOver === tab.id && tabDrag !== tab.id ? ' merge-target' : ''}${tabDrag === tab.id ? ' dragging' : ''}`}
            draggable={editing !== tab.id}
            onDragStart={() => setTabDrag(tab.id)}
            onDragOver={(e) => {
              e.preventDefault()
              if (tabOver !== tab.id) setTabOver(tab.id)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (tabDrag != null) mergeTabs(tabDrag, tab.id)
              setTabDrag(null)
              setTabOver(null)
            }}
            onDragEnd={() => {
              setTabDrag(null)
              setTabOver(null)
            }}
            onClick={() => setActiveId(tab.id)}
            onDoubleClick={() => {
              setDraft(tab.name)
              setEditing(tab.id)
            }}
            title="Double-click to rename · drag onto another tab to merge"
          >
            {tab.id !== activeId &&
              tab.panes.some((p) => p.sessionId && alerts.has(p.sessionId)) && (
                <span className="term-tab-alert" title="A session in this tab needs a response" />
              )}
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
        {tabs.length > 1 && (
          <button className="term-tab-add" onClick={mergeAll} title="Merge all tabs into one grid">
            ⊞
          </button>
        )}
        <button className="term-tab-add" onClick={newEmptyTab} title="New tab">
          ＋
        </button>
      </div>

      {active ? (
        <>
          <div className="terminals-toolbar">
            <Dropdown
              value=""
              triggerLabel="＋ Split pane"
              options={splitOptions}
              onChange={onSplit}
              searchable
              minWidth={240}
            />
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
          <PaneGrid
            panes={active.panes}
            layout={active.layout}
            showSidebar={showSidebar}
            focusedId={focusedPaneId}
            onClose={(p) => closePane(active.id, p)}
            onRestart={(p) => void restartPane(active.id, p)}
            onReorder={(f, to) => reorder(active.id, f, to)}
            onFocus={setFocusedPaneId}
            onRename={renamePane}
          />
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
