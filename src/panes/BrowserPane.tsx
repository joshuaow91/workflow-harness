import { useEffect, useRef, useState } from 'react'
import type { WebviewElement } from '../webview'

const HOME_URL = 'https://github.com'

function normalizeInput(raw: string): string {
  const text = raw.trim()
  if (!text) return HOME_URL
  if (/^https?:\/\//i.test(text)) return text
  // Looks like a domain/path (has a dot, no spaces) -> https; else web search.
  if (/^[^\s]+\.[^\s]+$/.test(text)) return `https://${text}`
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`
}

export function BrowserPane() {
  const ref = useRef<WebviewElement | null>(null)
  const [address, setAddress] = useState(HOME_URL)
  const [loading, setLoading] = useState(false)
  const [nav, setNav] = useState({ back: false, forward: false })

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

    wv.addEventListener('did-start-loading', onStart)
    wv.addEventListener('did-stop-loading', onStop)
    wv.addEventListener('did-navigate', syncNav)
    wv.addEventListener('did-navigate-in-page', syncNav)

    return () => {
      wv.removeEventListener('did-start-loading', onStart)
      wv.removeEventListener('did-stop-loading', onStop)
      wv.removeEventListener('did-navigate', syncNav)
      wv.removeEventListener('did-navigate-in-page', syncNav)
    }
  }, [])

  const go = (): void => {
    const url = normalizeInput(address)
    setAddress(url)
    void ref.current?.loadURL(url)
  }

  return (
    <div className="browser">
      <div className="browser-bar">
        <button
          className="nav-btn"
          disabled={!nav.back}
          onClick={() => ref.current?.goBack()}
          title="Back"
        >
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
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go()}
          spellCheck={false}
          placeholder="Enter a URL or search…"
        />
      </div>
      <div className="browser-view">
        {/* eslint-disable-next-line react/no-unknown-property */}
        <webview ref={ref as never} src={HOME_URL} partition="persist:harness" />
      </div>
    </div>
  )
}
