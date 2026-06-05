import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { WebviewElement } from '../webview'
import { normalizeInput } from '../lib/url'

interface WebFrameProps {
  /** Initial URL, and target to navigate to when this prop changes. */
  src: string
  /** Editable address bar (full browser) vs read-only current URL (embeds). */
  editableAddress?: boolean
  partition?: string
  leftSlot?: ReactNode
  /** Fired with this view's webContents id on dom-ready and whenever it's focused. */
  onActivate?: (webContentsId: number) => void
  onTitle?: (title: string) => void
}

export function WebFrame({
  src,
  editableAddress = true,
  partition = 'persist:harness',
  leftSlot,
  onActivate,
  onTitle
}: WebFrameProps) {
  const ref = useRef<WebviewElement | null>(null)
  const wcId = useRef<number | null>(null)
  const [address, setAddress] = useState(src)
  const [loading, setLoading] = useState(false)
  const [nav, setNav] = useState({ back: false, forward: false })
  const lastSrc = useRef(src)

  const activate = (): void => {
    if (wcId.current != null) onActivate?.(wcId.current)
  }

  useEffect(() => {
    const wv = ref.current
    if (!wv) return

    const syncNav = (): void => {
      setAddress(wv.getURL())
      setNav({ back: wv.canGoBack(), forward: wv.canGoForward() })
    }
    const onStart = (): void => setLoading(true)
    const onStop = (): void => {
      setLoading(false)
      syncNav()
    }
    const onDomReady = (): void => {
      wcId.current = (wv as unknown as { getWebContentsId(): number }).getWebContentsId()
      // Normalize zoom to 100% (it can default/persist higher per-host).
      try {
        ;(wv as unknown as { setZoomLevel(n: number): void }).setZoomLevel(0)
        ;(wv as unknown as { setZoomFactor(n: number): void }).setZoomFactor(1)
      } catch {
        /* not ready */
      }
      activate()
    }
    const onTitleUpdate = (e: Event): void => onTitle?.((e as unknown as { title: string }).title)
    const onFocusIn = (): void => activate()

    wv.addEventListener('did-start-loading', onStart)
    wv.addEventListener('did-stop-loading', onStop)
    wv.addEventListener('did-navigate', syncNav)
    wv.addEventListener('did-navigate-in-page', syncNav)
    wv.addEventListener('dom-ready', onDomReady)
    wv.addEventListener('page-title-updated', onTitleUpdate)
    wv.addEventListener('focus', onFocusIn)

    return () => {
      wv.removeEventListener('did-start-loading', onStart)
      wv.removeEventListener('did-stop-loading', onStop)
      wv.removeEventListener('did-navigate', syncNav)
      wv.removeEventListener('did-navigate-in-page', syncNav)
      wv.removeEventListener('dom-ready', onDomReady)
      wv.removeEventListener('page-title-updated', onTitleUpdate)
      wv.removeEventListener('focus', onFocusIn)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Navigate when the controlled src changes from outside.
  useEffect(() => {
    if (src !== lastSrc.current) {
      lastSrc.current = src
      setAddress(src)
      void ref.current?.loadURL(src)
    }
  }, [src])

  const go = (): void => {
    const url = normalizeInput(address)
    setAddress(url)
    void ref.current?.loadURL(url)
  }

  return (
    <div className="webframe" onMouseDown={activate}>
      <div className="browser-bar">
        {leftSlot}
        <button className="nav-btn" disabled={!nav.back} onClick={() => ref.current?.goBack()} title="Back">
          ‹
        </button>
        <button
          className="nav-btn"
          disabled={!nav.forward}
          onClick={() => ref.current?.goForward()}
          title="Forward"
        >
          ›
        </button>
        <button
          className="nav-btn"
          onClick={() => (loading ? ref.current?.stop() : ref.current?.reload())}
          title={loading ? 'Stop' : 'Reload'}
        >
          {loading ? '✕' : '↻'}
        </button>
        <input
          className="address"
          value={address}
          readOnly={!editableAddress}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && editableAddress && go()}
          spellCheck={false}
          placeholder="Search Brave or enter a URL…"
        />
        <button
          className="nav-btn"
          title="Open in Brave"
          onClick={() => void window.api.system.openInBrave(ref.current?.getURL() ?? address)}
        >
          🦁
        </button>
      </div>
      <div className="browser-view">
        {/* eslint-disable-next-line react/no-unknown-property */}
        <webview ref={ref as never} src={src} partition={partition} />
      </div>
    </div>
  )
}
