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
  /** Fired with the page's Badging-API count (navigator.setAppBadge), e.g. unread. */
  onBadge?: (count: number) => void
}

// Injected into comms webviews to bridge the Badging API back to the host via
// console messages (no webview preload needed).
const BADGE_HOOK = `(function(){
  if(window.__hb)return; window.__hb=1;
  var send=function(n){ try{console.log('__HB__'+(n>0?Math.floor(n):0))}catch(e){} };
  var os=navigator.setAppBadge&&navigator.setAppBadge.bind(navigator);
  navigator.setAppBadge=function(n){ send(typeof n==='number'?n:1); return os?os(n):Promise.resolve(); };
  var oc=navigator.clearAppBadge&&navigator.clearAppBadge.bind(navigator);
  navigator.clearAppBadge=function(){ send(0); return oc?oc():Promise.resolve(); };
})();`

export function WebFrame({
  src,
  editableAddress = true,
  partition = 'persist:harness',
  leftSlot,
  onActivate,
  onTitle,
  onBadge
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
      activate()
      if (onBadge) void (wv as unknown as { executeJavaScript(s: string): Promise<unknown> }).executeJavaScript(BADGE_HOOK).catch(() => undefined)
    }
    const onTitleUpdate = (e: Event): void => onTitle?.((e as unknown as { title: string }).title)
    const onConsole = (e: Event): void => {
      const m = String((e as unknown as { message?: string }).message ?? '').match(/__HB__(\d+)/)
      if (m) onBadge?.(Number(m[1]))
    }
    const onFocusIn = (): void => activate()

    wv.addEventListener('did-start-loading', onStart)
    wv.addEventListener('did-stop-loading', onStop)
    wv.addEventListener('did-navigate', syncNav)
    wv.addEventListener('did-navigate-in-page', syncNav)
    wv.addEventListener('dom-ready', onDomReady)
    wv.addEventListener('page-title-updated', onTitleUpdate)
    wv.addEventListener('console-message', onConsole)
    wv.addEventListener('focus', onFocusIn)

    return () => {
      wv.removeEventListener('did-start-loading', onStart)
      wv.removeEventListener('did-stop-loading', onStop)
      wv.removeEventListener('did-navigate', syncNav)
      wv.removeEventListener('did-navigate-in-page', syncNav)
      wv.removeEventListener('dom-ready', onDomReady)
      wv.removeEventListener('page-title-updated', onTitleUpdate)
      wv.removeEventListener('console-message', onConsole)
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
        <webview
          ref={ref as never}
          src={src}
          partition={partition}
          {...{ webpreferences: 'backgroundThrottling=no' }}
        />
      </div>
    </div>
  )
}
