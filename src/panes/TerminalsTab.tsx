import { useEffect, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { TerminalSpawnOptions } from '@shared/types'
import { terminalBus } from '../lib/terminalBus'
import { useDefaultSessionDir } from '../lib/settingsStore'
import { TerminalPane } from './TerminalPane'

interface Pane {
  id: number
  mountKey: number
  opts: TerminalSpawnOptions
}

function basename(p: string): string {
  return p.split('/').filter(Boolean).pop() ?? p
}

export function TerminalsTab() {
  const [panes, setPanes] = useState<Pane[]>([])
  const [direction, setDirection] = useState<'horizontal' | 'vertical'>('horizontal')
  const nextId = useRef(1)
  const defaultDir = useDefaultSessionDir()

  const addPane = (opts: TerminalSpawnOptions): void => {
    setPanes((prev) => [...prev, { id: nextId.current++, mountKey: 0, opts }])
  }

  useEffect(() => terminalBus.subscribe(addPane), [])

  const closePane = (id: number): void => setPanes((prev) => prev.filter((p) => p.id !== id))
  const restartPane = (id: number): void =>
    setPanes((prev) => prev.map((p) => (p.id === id ? { ...p, mountKey: p.mountKey + 1 } : p)))

  const newShell = (): void => addPane({ cwd: defaultDir })

  return (
    <div className="terminals">
      <div className="terminals-toolbar">
        <button className="tbtn" onClick={newShell}>
          ＋ New Terminal
        </button>
        <button
          className="tbtn"
          onClick={() => setDirection((d) => (d === 'horizontal' ? 'vertical' : 'horizontal'))}
          disabled={panes.length < 2}
          title="Toggle split direction"
        >
          {direction === 'horizontal' ? '⬍ Stack' : '⬌ Side-by-side'}
        </button>
        <span className="terminals-hint">
          {panes.length === 0
            ? 'Pick a session or repo in the sidebar to launch claude here.'
            : `${panes.length} pane${panes.length > 1 ? 's' : ''}`}
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
        <PanelGroup direction={direction} className="terminals-grid">
          {panes.map((pane, i) => (
            <PanelFragment
              key={pane.id}
              first={i === 0}
              pane={pane}
              onClose={() => closePane(pane.id)}
              onRestart={() => restartPane(pane.id)}
            />
          ))}
        </PanelGroup>
      )}
    </div>
  )
}

function PanelFragment({
  pane,
  first,
  onClose,
  onRestart
}: {
  pane: Pane
  first: boolean
  onClose: () => void
  onRestart: () => void
}) {
  const label = pane.opts.label ?? basename(pane.opts.cwd)
  return (
    <>
      {!first && <PanelResizeHandle className="resize-handle" />}
      <Panel minSize={12} className="term-panel">
        <div className="term-panel-header">
          <span className="term-panel-title" title={pane.opts.cwd}>
            {pane.opts.initialCommand ? '◐ ' : '$ '}
            {label}
          </span>
          <div className="term-panel-actions">
            <button className="term-act" title="Restart pane" onClick={onRestart}>
              ↻
            </button>
            <button className="term-act" title="Close pane" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>
        <div className="term-panel-body">
          <TerminalPane key={pane.mountKey} opts={pane.opts} />
        </div>
      </Panel>
    </>
  )
}
