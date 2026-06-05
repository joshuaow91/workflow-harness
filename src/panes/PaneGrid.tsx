import { useState } from 'react'
import type { TerminalSpawnOptions } from '@shared/types'
import { TerminalPane } from './TerminalPane'
import { TermSidebar } from './TermSidebar'

export type Layout = 'cols' | 'rows' | 'grid' | 'mainGrid'

export interface Pane {
  paneId: number
  terminalId: string
  opts: TerminalSpawnOptions
  sessionId?: string
}

function basename(p: string): string {
  return p.split('/').filter(Boolean).pop() ?? p
}

// Renders a set of terminal panes in the chosen layout (CSS flex/grid so panes
// never remount on layout change/reorder) with drag-to-reorder.
export function PaneGrid({
  panes,
  layout,
  showSidebar,
  onClose,
  onRestart,
  onReorder
}: {
  panes: Pane[]
  layout: Layout
  showSidebar: boolean
  onClose: (paneId: number) => void
  onRestart: (paneId: number) => void
  onReorder: (fromId: number, toId: number) => void
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  const gridStyle = (): React.CSSProperties => {
    const n = panes.length
    if (layout === 'cols') return { display: 'flex', flexDirection: 'row' }
    if (layout === 'rows') return { display: 'flex', flexDirection: 'column' }
    if (layout === 'grid') {
      const cols = Math.ceil(Math.sqrt(n))
      return { display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: '1fr' }
    }
    return {
      display: 'grid',
      gridTemplateColumns: n > 1 ? '2fr 1fr' : '1fr',
      gridTemplateRows: `repeat(${Math.max(1, n - 1)}, 1fr)`
    }
  }

  const paneStyle = (i: number): React.CSSProperties => {
    if (layout === 'cols' || layout === 'rows') return { flex: 1, minWidth: 0, minHeight: 0 }
    if (layout === 'mainGrid' && i === 0)
      return { gridColumn: 1, gridRow: '1 / -1', minWidth: 0, minHeight: 0 }
    return { minWidth: 0, minHeight: 0 }
  }

  return (
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
            if (drag != null && drag !== pane.paneId) onReorder(drag, pane.paneId)
            setDrag(null)
            setOver(null)
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
              <button className="term-act" title="Restart pane" onClick={() => onRestart(pane.paneId)}>
                ↻
              </button>
              <button className="term-act" title="Close pane" onClick={() => onClose(pane.paneId)}>
                ✕
              </button>
            </div>
          </div>
          <div className="term-panel-body">
            <div className="term-pane-term">
              <TerminalPane id={pane.terminalId} />
            </div>
            {showSidebar && pane.sessionId && <TermSidebar sessionId={pane.sessionId} />}
          </div>
        </div>
      ))}
    </div>
  )
}
