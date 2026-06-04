import { useEffect, useMemo, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { DatadogDashboard } from '@shared/types'
import { useAsync } from '../lib/useAsync'
import { WebFrame } from '../panes/WebFrame'

function MissingKeys() {
  return (
    <div className="placeholder">
      <div className="ph-emoji">📊</div>
      <div className="ph-title">Datadog keys needed</div>
      <div className="ph-sub">
        Add <code>DD_API_KEY</code> and <code>DD_APP_KEY</code> in Settings → Datadog (or export them
        as env vars), then reopen this tab.
      </div>
    </div>
  )
}

export function DatadogTab() {
  const { data, error, loading, reload } = useAsync(() => window.api.datadog.listDashboards(), [])
  const [selected, setSelected] = useState<DatadogDashboard | null>(null)
  const [q, setQ] = useState('')

  const dashboards = data ?? []
  useEffect(() => {
    if (!selected && dashboards.length > 0) {
      setSelected(dashboards.find((d) => d.custom) ?? dashboards[0])
    }
  }, [selected, dashboards])

  const { custom, builtin } = useMemo(() => {
    const f = q.trim().toLowerCase()
    const match = (d: DatadogDashboard): boolean => !f || d.title.toLowerCase().includes(f)
    return {
      custom: dashboards.filter((d) => d.custom && match(d)),
      builtin: dashboards.filter((d) => !d.custom && match(d))
    }
  }, [dashboards, q])

  if (error?.includes('NO_DD_KEYS')) return <MissingKeys />

  const item = (d: DatadogDashboard): React.ReactElement => (
    <button
      key={d.id}
      className={`dd-item${selected?.id === d.id ? ' sel' : ''}`}
      onClick={() => setSelected(d)}
      title={d.title}
    >
      {d.title}
    </button>
  )

  return (
    <div className="dd-tab">
      <PanelGroup direction="horizontal" autoSaveId="dd-h">
        <Panel defaultSize={26} minSize={16}>
          <div className="dd-listcol">
            <div className="dd-listbar">
              <input
                className="dd-search"
                placeholder="Search dashboards…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button className="term-act" title="Refresh" onClick={reload}>
                ↻
              </button>
            </div>
            <div className="dd-list">
              {loading && <div className="side-term-hint">Loading dashboards…</div>}
              {error && !error.includes('NO_DD_KEYS') && (
                <div className="gh-state gh-error">{error}</div>
              )}
              {custom.length > 0 && <div className="dd-group">Custom</div>}
              {custom.map(item)}
              {builtin.length > 0 && <div className="dd-group">Built-in</div>}
              {builtin.map(item)}
            </div>
          </div>
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel defaultSize={74} minSize={30}>
          <div className="dd-view">
            {selected ? (
              <WebFrame src={selected.url} editableAddress={false} />
            ) : (
              <div className="placeholder">
                <div className="ph-sub">Select a dashboard.</div>
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
