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
import { OpenSessionsSync } from '../lib/openSessions'
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
  // Which tab is the drop target, and what the drop will do: reorder (default
  // drag) or merge (hold ⌥). Same single hook as before, so Fast Refresh keeps
  // session state across this edit instead of remounting.
  const [tabOver, setTabOver] = useState<{ id: number; mode: 'reorder' | 'merge' } | null>(null)
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

  // `tabs` read inside the bus subscription would be the mount-time closure, so
  // keep a ref for the already-open lookup below.
  const tabsRef = useRef<Tab[]>([])
  tabsRef.current = tabs

  // Each opened session becomes its own tab — unless it's already open, in which
  // case go to it. Resuming a session you already have open should switch to it,
  // not stack a duplicate tab on the same conversation.
  const openTab = async (opts: TerminalSpawnOptions): Promise<void> => {
    const rid = opts.initialCommand?.match(/--(?:resume|session-id)\s+(\S+)/)?.[1]
    if (rid) {
      for (const t of tabsRef.current) {
        const pane = t.panes.find((p) => p.sessionId === rid)
        if (pane) {
          setActiveId(t.id)
          setFocusedPaneId(pane.paneId)
          focusTerminal(pane.terminalId)
          return
        }
      }
    }
    const pane = await makePane(opts)
    const id = tabCounter.current++
    setTabs((t) => [...t, { id, name: opts.label ?? basename(opts.cwd), panes: [pane], layout: 'cols' }])
    setActiveId(id)
  }
  useEffect(() => terminalBus.subscribe((opts) => void openTab(opts)), [])

  type SavedPane = TerminalSpawnOptions & { _b?: string }
  type SavedLayout = {
    activeIndex?: number
    tabs?: { name: string; layout: Layout; panes: SavedPane[] }[]
  }

  const [restoreErr, setRestoreErr] = useState<string | null>(null)

  // Rebuild tabs/panes from a saved layout, re-launching each pane's command.
  // Which saved sessions have a real conversation (messageCount > 0)? Only those
  // are resumable — a title-only stub exists on disk but `claude --resume` fails
  // "No conversation found", and `--session-id` on its id fails "already in use".
  // So: resumable -> --resume; anything else (stub/missing) -> a fresh id.
  const restoreLayout = async (saved: SavedLayout | null): Promise<void> => {
    if (!saved?.tabs?.length) return
    const resumable = new Set<string>()
    try {
      const projects = await window.api.claude.getProjects()
      for (const p of projects) for (const s of p.sessions) if (s.messageCount > 0) resumable.add(s.sessionId)
    } catch {
      /* ignore */
    }
    const rebuilt: Tab[] = []
    for (const st of saved.tabs) {
      const panes: Pane[] = []
      for (const raw of st.panes) {
        const { _b, ...opts } = raw
        if (_b) {
          panes.push({ paneId: paneCounter.current++, terminalId: '', opts, browserUrl: _b })
          continue
        }
        const id = opts.initialCommand?.match(/--(?:session-id|resume)\s+(\S+)/)?.[1]
        let initialCommand = opts.initialCommand
        if (id)
          initialCommand = resumable.has(id)
            ? opts.initialCommand?.replace(/--session-id(\s+\S+)/, '--resume$1')
            : opts.initialCommand?.replace(/--(?:session-id|resume)\s+\S+/, `--session-id ${crypto.randomUUID()}`)
        panes.push(await makePane({ ...opts, initialCommand }))
      }
      rebuilt.push({ id: tabCounter.current++, name: st.name, layout: st.layout, panes })
    }
    if (rebuilt.length) {
      setTabs(rebuilt)
      setActiveId(rebuilt[Math.min(saved.activeIndex ?? 0, rebuilt.length - 1)].id)
    }
  }

  // Manual recovery: prefer the disk backup (survives an HMR/localStorage wipe),
  // fall back to localStorage. Surfaced via "Restore last layout" in the empty state.
  const restoreLast = async (): Promise<void> => {
    setRestoreErr(null)
    try {
      const json = (await window.api.terminal.getLayout()) || localStorage.getItem('harness:terminals') || ''
      const saved = json ? (JSON.parse(json) as SavedLayout) : null
      if (!saved?.tabs?.length) {
        setRestoreErr('No saved layout found.')
        return
      }
      await restoreLayout(saved)
    } catch (e) {
      setRestoreErr((e as Error).message)
    }
  }

  // Restore the saved tab/pane/layout on first mount. Read BOTH mirrors and use
  // whichever has more tabs: the on-disk backup survives a localStorage clobber
  // (e.g. two app instances racing on the same storage), so it's the safer source.
  const hydrated = useRef(false)
  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    const parse = (s: string | null): SavedLayout | null => {
      try {
        return s ? (JSON.parse(s) as SavedLayout) : null
      } catch {
        return null
      }
    }
    void (async () => {
      const local = parse(localStorage.getItem('harness:terminals'))
      let disk: SavedLayout | null = null
      try {
        disk = parse(await window.api.terminal.getLayout())
      } catch {
        /* ignore */
      }
      const pick =
        (disk?.tabs?.length ?? 0) >= (local?.tabs?.length ?? 0) ? disk ?? local : local ?? disk
      void restoreLayout(pick)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist the layout (without runtime ids).
  useEffect(() => {
    // Never persist an empty layout: a Fast-Refresh remount (HMR) momentarily
    // resets `tabs` to [], and saving that would wipe the real saved layout.
    // Closing the last tab simply leaves the prior layout saved — acceptable.
    if (tabs.length === 0) return
    try {
      const json = JSON.stringify({
        activeIndex: tabs.findIndex((t) => t.id === activeId),
        tabs: tabs.map((t) => ({
          name: t.name,
          layout: t.layout,
          panes: t.panes.map((p) => (p.browserUrl ? { ...p.opts, _b: p.browserUrl } : p.opts))
        }))
      })
      localStorage.setItem('harness:terminals', json)
      // Mirror to a durable disk backup so an HMR/localStorage wipe is recoverable.
      void window.api.terminal.saveLayout(json)
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

  // Add a browser (WebFrame) pane to the active tab.
  const splitBrowser = (): void => {
    const url = settingsStore.get()?.defaultBrowserUrl || 'https://www.google.com'
    const pane: Pane = {
      paneId: paneCounter.current++,
      terminalId: '',
      opts: { cwd: splitCwd, label: 'browser' },
      browserUrl: url
    }
    if (!active) {
      const id = tabCounter.current++
      setTabs((t) => [...t, { id, name: 'browser', panes: [pane], layout: 'cols' }])
      setActiveId(id)
    } else {
      setTabs((t) => t.map((x) => (x.id === active.id ? { ...x, panes: [...x.panes, pane] } : x)))
    }
  }

  const splitCwd = active?.panes[0]?.opts.cwd ?? defaultDir
  const splitOptions: DropdownOption[] = [
    { value: '__claude', label: `＋ new ${agent.cli}`, sublabel: basename(splitCwd) },
    { value: '__shell', label: '＋ shell', sublabel: basename(splitCwd) },
    { value: '__browser', label: '＋ browser', sublabel: 'web page' },
    ...sessions.slice(0, 60).map((s) => ({
      value: s.sessionId,
      label: `${s.live ? '● ' : ''}${s.title}`,
      sublabel: s.projectName
    }))
  ]
  const onSplit = async (value: string): Promise<void> => {
    if (value === '__browser') splitBrowser()
    else if (value === '__shell') void splitWith({ cwd: splitCwd, label: `shell · ${basename(splitCwd)}` })
    else if (value === '__claude')
      void splitWith({ cwd: splitCwd, initialCommand: await claudeCommand(), label: `${agent.cli} · ${basename(splitCwd)}` })
    else {
      const s = sessions.find((x) => x.sessionId === value)
      if (s) void splitWith({ cwd: s.cwd, initialCommand: await claudeCommand(s.sessionId), label: s.title })
    }
  }

  // Free a pane's backing resource when it's truly closed: a browser pane owns a
  // persistent native view (destroyed explicitly, not on unmount), a terminal
  // pane owns a pty.
  const disposePane = (p: Pane): void => {
    if (p.browserUrl != null) void window.api.browserView.destroy(`pane-${p.paneId}`)
    else window.api.terminal.kill(p.terminalId)
  }

  const closePane = (tabId: number, paneId: number): void =>
    setTabs((t) => {
      const tab = t.find((x) => x.id === tabId)
      const pane = tab?.panes.find((p) => p.paneId === paneId)
      if (pane) disposePane(pane)
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
      t.find((x) => x.id === tabId)?.panes.forEach(disposePane)
      const remaining = t.filter((x) => x.id !== tabId)
      if (tabId === activeId) setActiveId(remaining.length ? remaining[remaining.length - 1].id : null)
      return remaining
    })

  const setLayout = (tabId: number, layout: Layout): void =>
    setTabs((t) => t.map((x) => (x.id === tabId ? { ...x, layout } : x)))

  // Reorder the tab strip: move the dragged tab to the drop target's position.
  const reorderTabs = (fromId: number, toId: number): void =>
    setTabs((t) => {
      const ids = t.map((x) => x.id)
      const from = ids.indexOf(fromId)
      const to = ids.indexOf(toId)
      if (from < 0 || to < 0 || from === to) return t
      const arr = [...t]
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      return arr
    })

  // Pop a pane out of a multi-pane tab into its own new tab. The pane keeps its
  // terminalId (no kill/respawn — the process keeps running); it just re-mounts
  // in the new tab. No-op for a tab that already has a single pane.
  const extractPane = (tabId: number, paneId: number): void => {
    const tab = tabs.find((x) => x.id === tabId)
    const pane = tab?.panes.find((p) => p.paneId === paneId)
    if (!tab || !pane || tab.panes.length <= 1) return
    const id = tabCounter.current++
    setTabs((t) => {
      const updated = t.map((x) =>
        x.id === tabId ? { ...x, panes: x.panes.filter((p) => p.paneId !== paneId) } : x
      )
      const idx = updated.findIndex((x) => x.id === tabId)
      const newTab: Tab = {
        id,
        name: pane.opts.label ?? basename(pane.opts.cwd),
        panes: [pane],
        layout: 'cols'
      }
      updated.splice(idx + 1, 0, newTab)
      return updated
    })
    setActiveId(id)
  }

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

  // Sessions open in any pane (across all tabs) are live even when claude wrote
  // no ~/.claude/sessions file — feed them (with their terminalId) to the sidebar
  // liveness store, which also taps pty output to derive busy/idle + last-active.
  const openPanes = tabs.flatMap((t) =>
    t.panes
      .filter((p) => p.sessionId)
      .map((p) => ({ terminalId: p.terminalId, sessionId: p.sessionId as string }))
  )

  return (
    <div className="terminals">
      <OpenSessionsSync panes={openPanes} />
      {tabDrag != null && (
        <div className="term-drag-hint">
          {tabOver?.mode === 'merge' ? (
            <>
              Merging panes into this tab — release <kbd>⌥</kbd> to reorder instead
            </>
          ) : (
            <>
              Drop to reorder · hold <kbd>⌥</kbd> to merge into a tab
            </>
          )}
        </div>
      )}
      <div className="term-tabstrip">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`term-tab${tab.id === activeId ? ' active' : ''}${tabOver?.id === tab.id && tabDrag !== tab.id ? (tabOver.mode === 'merge' ? ' merge-target' : ' reorder-target') : ''}${tabDrag === tab.id ? ' dragging' : ''}`}
            draggable={editing !== tab.id}
            onDragStart={() => setTabDrag(tab.id)}
            onDragOver={(e) => {
              e.preventDefault()
              const mode = e.altKey ? 'merge' : 'reorder'
              if (tabOver?.id !== tab.id || tabOver.mode !== mode) setTabOver({ id: tab.id, mode })
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (tabDrag != null && tabDrag !== tab.id) {
                if (e.altKey) mergeTabs(tabDrag, tab.id)
                else reorderTabs(tabDrag, tab.id)
              }
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
            title="Drag to reorder · hold ⌥ and drop on a tab to merge · double-click to rename"
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
              <Icon name="close" size={13} />
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
            onExtract={(p) => extractPane(active.id, p)}
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
          <button className="tbtn" style={{ marginTop: 12 }} onClick={() => void restoreLast()}>
            <Icon name="refresh" size={14} /> Restore last layout
          </button>
          {restoreErr && (
            <div className="ph-sub" style={{ marginTop: 6, opacity: 0.8 }}>
              {restoreErr}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
