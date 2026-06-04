import { useEffect, useRef, useState } from 'react'
import type { TerminalSpawnOptions } from '@shared/types'
import { terminalBus } from '../lib/terminalBus'
import { useDefaultSessionDir } from '../lib/settingsStore'
import { Icon } from '../components/Icon'
import { TerminalPane } from './TerminalPane'

type Layout = 'cols' | 'rows' | 'grid' | 'mainGrid'

interface Pane {
  paneId: number
  terminalId: string
  opts: TerminalSpawnOptions
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
  const [panes, setPanes] = useState<Pane[]>([])
  const [layout, setLayout] = useState<Layout>('cols')
  const nextId = useRef(1)
  const defaultDir = useDefaultSessionDir()
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  const addPane = async (opts: TerminalSpawnOptions): Promise<void> => {
    const terminalId = await window.api.terminal.create(opts)
    setPanes((p) => [...p, { paneId: nextId.current++, terminalId, opts }])
  }
  useEffect(() => terminalBus.subscribe((opts) => void addPane(opts)), [])

  const closePane = (paneId: number): void =>
    setPanes((p) => {
      const pane = p.find((x) => x.paneId === paneId)
      if (pane) window.api.terminal.kill(pane.terminalId)
      return p.filter((x) => x.paneId !== paneId)
    })

  const restartPane = async (paneId: number): Promise<void> => {
    const pane = panes.find((x) => x.paneId === paneId)
    if (!pane) return
    window.api.terminal.kill(pane.terminalId)
    const terminalId = await window.api.terminal.create(pane.opts)
    setPanes((p) => p.map((x) => (x.paneId === paneId ? { ...x, terminalId } : x)))
  }

  const newShell = (): void => void addPane({ cwd: defaultDir, label: `shell · ${basename(defaultDir)}` })

  const drop = (targetPaneId: number): void => {
    if (drag == null || drag === targetPaneId) return
    setPanes((p) => {
      const ids = p.map((x) => x.paneId)
      const from = ids.indexOf(drag)
      const to = ids.indexOf(targetPaneId)
      if (from < 0 || to < 0) return p
      const next = [...p]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    setDrag(null)
    setOver(null)
  }

  const gridStyle = (): React.CSSProperties => {
    const n = panes.length
    if (layout === 'cols') return { display: 'flex', flexDirection: 'row' }
    if (layout === 'rows') return { display: 'flex', flexDirection: 'column' }
    if (layout === 'grid') {
      const cols = Math.ceil(Math.sqrt(n))
      return { display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: '1fr' }
    }
    // mainGrid: first pane large on the left, the rest stacked on the right
    return {
      display: 'grid',
      gridTemplateColumns: n > 1 ? '2fr 1fr' : '1fr',
      gridTemplateRows: `repeat(${Math.max(1, n - 1)}, 1fr)`
    }
  }

  const paneStyle = (i: number): React.CSSProperties => {
    if (layout === 'cols' || layout === 'rows') return { flex: 1, minWidth: 0, minHeight: 0 }
    if (layout === 'mainGrid' && i === 0) return { gridColumn: 1, gridRow: '1 / -1', minWidth: 0, minHeight: 0 }
    return { minWidth: 0, minHeight: 0 }
  }

  return (
    <div className="terminals">
      <div className="terminals-toolbar">
        <button className="tbtn" onClick={newShell}>
          ＋ New Terminal
        </button>
        <div className="term-layouts">
          {LAYOUTS.map((l) => (
            <button
              key={l.key}
              className={`term-layout${layout === l.key ? ' active' : ''}`}
              title={l.title}
              onClick={() => setLayout(l.key)}
            >
              <Icon name={l.key} size={15} />
            </button>
          ))}
        </div>
        <span className="terminals-hint">
          {panes.length === 0
            ? 'Pick a session or repo in the sidebar to launch claude here.'
            : `${panes.length} pane${panes.length > 1 ? 's' : ''} · drag headers to reorder`}
        </span>
      </div>

      {panes.length === 0 ? (
        <div className="placeholder">
          <div className="ph-emoji">⌨️</div>
          <div className="ph-title">No terminals open</div>
          <div className="ph-sub">
            Click a session in the sidebar to resume it with <code>claude --resume</code>, or open a
            fresh shell with “New Terminal”.
          </div>
        </div>
      ) : (
        <div className="terminals-grid" style={gridStyle()}>
          {panes.map((pane, i) => (
            <div
              key={pane.paneId}
              className={`term-panel${over === pane.paneId && drag !== pane.paneId ? ' drag-over' : ''}${drag === pane.paneId ? ' dragging' : ''}`}
              style={paneStyle(i)}
              onDragOver={(e) => {
                e.preventDefault()
                if (over !== pane.paneId) setOver(pane.paneId)
              }}
              onDrop={(e) => {
                e.preventDefault()
                drop(pane.paneId)
              }}
            >
              <div
                className="term-panel-header"
                draggable
                onDragStart={() => setDrag(pane.paneId)}
                onDragEnd={() => {
                  setDrag(null)
                  setOver(null)
                }}
              >
                <span className="term-panel-title" title={pane.opts.cwd}>
                  {pane.opts.initialCommand ? '◐ ' : '$ '}
                  {pane.opts.label ?? basename(pane.opts.cwd)}
                </span>
                <div className="term-panel-actions">
                  <button className="term-act" title="Restart pane" onClick={() => void restartPane(pane.paneId)}>
                    ↻
                  </button>
                  <button className="term-act" title="Close pane" onClick={() => closePane(pane.paneId)}>
                    ✕
                  </button>
                </div>
              </div>
              <div className="term-panel-body">
                <TerminalPane id={pane.terminalId} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
