import { useEffect, useRef } from 'react'
import type { WebviewElement } from '../webview'

// A blank webview that hosts the embedded DevTools UI of whichever browser is
// active. We hand its webContents id up; the workspace wires it to the active
// browser via the devtools IPC.
export function DevToolsPane({ onReady }: { onReady: (webContentsId: number) => void }) {
  const ref = useRef<WebviewElement | null>(null)

  useEffect(() => {
    const wv = ref.current
    if (!wv) return
    const onDomReady = (): void => {
      const id = (wv as unknown as { getWebContentsId(): number }).getWebContentsId()
      onReady(id)
    }
    wv.addEventListener('dom-ready', onDomReady)
    return () => wv.removeEventListener('dom-ready', onDomReady)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="devtools-pane">
      {/* eslint-disable-next-line react/no-unknown-property */}
      <webview ref={ref as never} src="about:blank" partition="persist:harness-devtools" />
    </div>
  )
}
