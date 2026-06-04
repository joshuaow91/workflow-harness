import { useEffect, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, theme: 'dark' })

const DEFAULT = `flowchart TD
  A[Start] --> B{Working?}
  B -- Yes --> C[Ship it]
  B -- No --> D[Ask Claude]
  D --> A`

export function MermaidTab() {
  const [code, setCode] = useState(DEFAULT)
  const [svg, setSvg] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const idRef = useRef(0)

  // Claude can push a diagram via the render_mermaid MCP tool.
  useEffect(() => window.api.mermaid.onRender((c) => setCode(c)), [])

  useEffect(() => {
    let cancelled = false
    const id = `mmd-${idRef.current++}`
    mermaid
      .parse(code)
      .then(() => mermaid.render(id, code))
      .then(({ svg }) => {
        if (!cancelled) {
          setSvg(svg)
          setErr(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [code])

  return (
    <div className="mmd-tab">
      <PanelGroup direction="horizontal" autoSaveId="mmd-h">
        <Panel defaultSize={42} minSize={20}>
          <div className="mmd-editor-col">
            <div className="mmd-bar">Mermaid source</div>
            <textarea
              className="mmd-editor"
              value={code}
              spellCheck={false}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel defaultSize={58} minSize={20}>
          <div className="mmd-preview">
            {err ? (
              <div className="mmd-err">{err}</div>
            ) : (
              <div className="mmd-svg" dangerouslySetInnerHTML={{ __html: svg }} />
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
