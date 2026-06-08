import { useState } from 'react'
import type { TerminalSpawnOptions } from '@shared/types'
import { sessionAlerts, useSessionAlerts } from '../lib/sessionAlerts'
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

export function PaneGrid({
  panes,
  layout,
  showSidebar,
  focusedId,
  onClose,
  onRestart,
  onReorder,
  onFocus,
  onRename
}: {
  panes: Pane[]
  layout: Layout
  showSidebar: boolean
  focusedId: number | null
  onClose: (paneId: number) => void
  onRestart: (paneId: number) => void
  onReorder: (fromId: number, toId: number) => void
  onFocus: (paneId: number) => void
  onRename: (paneId: number, name: string) => void
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const alerts = useSessionAlerts()

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

  const startRename = (pane: Pane): void => {
    setDraft(pane.opts.label ?? basename(pane.opts.cwd))
    setEditing(pane.paneId)
  }
  const saveRename = (paneId: number): void => {
    const n = draft.trim()
    if (n) onRename(paneId, n)
    setEditing(null)
  }

  const focusPane = (pane: Pane): void => {
    onFocus(pane.paneId)
    if (pane.sessionId) sessionAlerts.clear(pane.sessionId)
  }

  return (
    <div className="terminals-grid" style={gridStyle()}>
      {panes.map((pane, i) => {
        const alerted = !!pane.sessionId && alerts.has(pane.sessionId)
        return (
          <div
            key={pane.paneId}
            data-pane-id={pane.paneId}
            className={`term-panel${over === pane.paneId && drag !== pane.paneId ? ' drag-over' : ''}${drag === pane.paneId ? ' dragging' : ''}${focusedId === pane.paneId ? ' focused' : ''}${alerted ? ' needs-response' : ''}`}
            style={paneStyle(i)}
            // Capture phase: xterm swallows mousedown in the terminal body, so a
            // bubble-phase handler wouldn't fire when you click into a pane.
            onMouseDownCapture={() => focusPane(pane)}
            onDragOver={(e) => {
              e.preventDefault()
              if (over !== pane.paneId) setOver(pane.paneId)
            }}
            onDragLeave={() => setOver((o) => (o === pane.paneId ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              if (drag != null && drag !== pane.paneId) onReorder(drag, pane.paneId)
              setDrag(null)
              setOver(null)
            }}
          >
            <div
              className="term-panel-header"
              draggable={editing !== pane.paneId}
              onDragStart={() => setDrag(pane.paneId)}
              onDragEnd={() => {
                setDrag(null)
                setOver(null)
              }}
            >
              {editing === pane.paneId ? (
                <input
                  autoFocus
                  className="term-tab-rename"
                  value={draft}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => saveRename(pane.paneId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveRename(pane.paneId)
                    if (e.key === 'Escape') setEditing(null)
                  }}
                />
              ) : (
                <span
                  className="term-panel-title"
                  title={`${pane.opts.cwd}\nDouble-click to rename`}
                  onDoubleClick={() => startRename(pane)}
                >
                  {pane.opts.initialCommand ? '◐ ' : '$ '}
                  {pane.opts.label ?? basename(pane.opts.cwd)}
                </span>
              )}
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
              {showSidebar && pane.sessionId && (
                <TermSidebar sessionId={pane.sessionId} terminalId={pane.terminalId} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
