import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../components/Icon'
import type { BrowserHistoryEntry } from '@shared/types'
import { normalizeInput } from '../lib/url'
import { browserViewBus } from '../lib/browserViewBus'

interface BrowserViewProps {
  /** Stable identity for the underlying native view. The view lives in main
   *  keyed by this id and is reused across remounts (terminal-tab switches), so
   *  it must be STABLE for a given pane/tab and NOT destroyed on unmount — the
   *  owner destroys it explicitly via window.api.browserView.destroy on close. */
  viewId: string
  /** Initial URL, and target to navigate to when this prop changes. */
  src: string
  /** Editable address bar (full browser) vs read-only current URL (embeds). */
  editableAddress?: boolean
  partition?: string
  leftSlot?: ReactNode
  /** Fired with this view's webContents id once created and on (re)activation. */
  onActivate?: (webContentsId: number) => void
  onTitle?: (title: string) => void
  onUrl?: (url: string) => void
  onFavicon?: (favicon?: string) => void
  onLoading?: (loading: boolean) => void
}

// Drop-in replacement for the old <webview>-based WebFrame, backed by a
// main-process WebContentsView. The toolbar is DOM; the page is a native view
// positioned over the empty `.browser-view` host below. Because the page lives
// in main keyed by viewId, switching tabs/panes (which remounts this component)
// only hides/repositions it — the page, scroll, and session survive.
export function BrowserView({
  viewId,
  src,
  editableAddress = true,
  partition = 'persist:harness',
  leftSlot,
  onActivate,
  onTitle,
  onUrl,
  onFavicon,
  onLoading
}: BrowserViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const wcId = useRef<number | null>(null)
  // webContents id as state too, so the extension toolbar (<browser-action-list>)
  // can target this tab once it's created.
  const [wcReady, setWcReady] = useState<number | null>(null)

  const [address, setAddress] = useState(src)
  const [loading, setLoading] = useState(false)
  const [nav, setNav] = useState({ back: false, forward: false })
  const [sugg, setSugg] = useState<BrowserHistoryEntry[]>([])
  const [showSug, setShowSug] = useState(false)
  const [sel, setSel] = useState(-1)
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [findMatch, setFindMatch] = useState({ active: 0, total: 0 })
  const addrRef = useRef<HTMLInputElement>(null)
  const findRef = useRef<HTMLInputElement>(null)

  // Latest callbacks without re-running the create effect.
  const cbs = useRef({ onActivate, onTitle, onUrl, onFavicon, onLoading })
  cbs.current = { onActivate, onTitle, onUrl, onFavicon, onLoading }

  const suspended = useRef(false)
  const addrFocused = useRef(false)
  const showSugRef = useRef(false)
  showSugRef.current = showSug
  const lastSrc = useRef(src)

  // ---- bounds / visibility sync: the native view tracks the host div ----
  const lastBounds = useRef('')
  const lastVisible = useRef<boolean | null>(null)
  const sync = (): void => {
    const el = hostRef.current
    if (!el || wcId.current == null) return
    const r = el.getBoundingClientRect()
    // offsetParent is null when an ancestor is display:none (inactive tab/pane).
    const onScreen = el.offsetParent !== null && r.width > 1 && r.height > 1
    const visible = onScreen && !suspended.current && !showSugRef.current
    if (visible) {
      const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`
      if (key !== lastBounds.current) {
        lastBounds.current = key
        void window.api.browserView.setBounds(viewId, {
          x: r.left,
          y: r.top,
          width: r.width,
          height: r.height
        })
      }
    }
    if (visible !== lastVisible.current) {
      lastVisible.current = visible
      void window.api.browserView.setVisible(viewId, visible)
    }
  }

  useEffect(() => {
    let alive = true
    let raf = 0
    // A rAF loop keeps bounds glued to the host through panel drags / layout
    // shifts that ResizeObserver can't see (position, not size, changes). The
    // dedupe above means IPC only fires when something actually moved.
    const loop = (): void => {
      sync()
      raf = requestAnimationFrame(loop)
    }

    void window.api.browserView.create(viewId, normalizeInput(src), partition).then((wc) => {
      if (!alive) return
      wcId.current = wc
      setWcReady(wc)
      cbs.current.onActivate?.(wc)
    })

    const offState = window.api.browserView.onState((s) => {
      if (s.id !== viewId) return
      setLoading(s.loading)
      setNav({ back: s.canGoBack, forward: s.canGoForward })
      if (!addrFocused.current) setAddress(s.url)
      cbs.current.onUrl?.(s.url)
      cbs.current.onTitle?.(s.title)
      cbs.current.onFavicon?.(s.favicon)
      cbs.current.onLoading?.(s.loading)
    })

    const offSuspend = browserViewBus.subscribe((s) => {
      suspended.current = s
      sync()
    })

    const offFind = window.api.browserView.onFindResult((r) => {
      if (r.id !== viewId) return
      setFindMatch({ active: r.activeMatchOrdinal, total: r.matches })
    })
    // Browser shortcuts forwarded from main when the native page has focus.
    const offShortcut = window.api.browserView.onShortcut((s) => {
      if (s.id !== viewId) return
      if (s.action === 'find') {
        setFindOpen(true)
        setTimeout(() => findRef.current?.focus(), 0)
      } else if (s.action === 'focusAddress') {
        addrRef.current?.focus()
        addrRef.current?.select()
      } else if (s.action === 'reload') void window.api.browserView.reload(viewId)
      else if (s.action === 'back') void window.api.browserView.goBack(viewId)
      else if (s.action === 'forward') void window.api.browserView.goForward(viewId)
      // newTab / closeTab are handled at the workspace level.
    })

    raf = requestAnimationFrame(loop)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      offState()
      offSuspend()
      offFind()
      offShortcut()
      // Persist the view across remounts (tab switch) — just hide it so it
      // doesn't float over whatever replaces this component. The owner destroys
      // it explicitly (browserView.destroy) only when the pane/tab is closed.
      void window.api.browserView.setVisible(viewId, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId])

  // Navigate when the controlled src changes from outside.
  useEffect(() => {
    if (src !== lastSrc.current) {
      lastSrc.current = src
      setAddress(src)
      void window.api.browserView.loadURL(viewId, normalizeInput(src))
    }
  }, [src, viewId])

  // The suggestions dropdown is DOM over the page area; hide the native view
  // while it's open so it isn't painted over, restore when it closes.
  useEffect(() => {
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSug])

  const activate = (): void => {
    if (wcId.current != null) cbs.current.onActivate?.(wcId.current)
  }
  const navTo = (url: string): void => {
    setAddress(url)
    setShowSug(false)
    void window.api.browserView.loadURL(viewId, normalizeInput(url))
  }
  const go = (): void => {
    const url = normalizeInput(address)
    setAddress(url)
    void window.api.browserView.loadURL(viewId, url)
  }
  // findNext=false starts/refines a search at the first match; true steps to the
  // next/prev match. Empty text clears the highlight.
  const runFind = (text: string, findNext: boolean, forward = true): void => {
    if (!text) {
      void window.api.browserView.stopFind(viewId)
      setFindMatch({ active: 0, total: 0 })
      return
    }
    void window.api.browserView.find(viewId, text, forward, findNext)
  }
  const closeFind = (): void => {
    setFindOpen(false)
    setFindText('')
    setFindMatch({ active: 0, total: 0 })
    void window.api.browserView.stopFind(viewId)
  }

  return (
    <div
      className="webframe"
      onMouseDown={activate}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
          e.preventDefault()
          setFindOpen(true)
          setTimeout(() => findRef.current?.focus(), 0)
        }
      }}
    >
      <div className="browser-bar">
        {leftSlot}
        <button
          className="nav-btn"
          disabled={!nav.back}
          onClick={() => void window.api.browserView.goBack(viewId)}
          title="Back"
        >
          ‹
        </button>
        <button
          className="nav-btn"
          disabled={!nav.forward}
          onClick={() => void window.api.browserView.goForward(viewId)}
          title="Forward"
        >
          ›
        </button>
        <button
          className="nav-btn"
          onClick={() =>
            loading
              ? void window.api.browserView.stop(viewId)
              : void window.api.browserView.reload(viewId)
          }
          title={loading ? 'Stop' : 'Reload'}
        >
          {loading ? <Icon name="close" size={13} /> : <Icon name="refresh" size={14} />}
        </button>
        <div className="address-wrap">
          <input
            ref={addrRef}
            className="address"
            value={address}
            readOnly={!editableAddress}
            onChange={(e) => {
              const v = e.target.value
              setAddress(v)
              if (editableAddress)
                void window.api.browser.suggest(v).then((s) => {
                  setSugg(s)
                  setShowSug(s.length > 0)
                  setSel(-1)
                })
            }}
            onKeyDown={(e) => {
              if (!editableAddress) return
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSel((i) => Math.min(i + 1, sugg.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSel((i) => Math.max(i - 1, -1))
              } else if (e.key === 'Enter') {
                if (showSug && sel >= 0 && sugg[sel]) navTo(sugg[sel].url)
                else go()
                setShowSug(false)
              } else if (e.key === 'Escape') {
                setShowSug(false)
              }
            }}
            onFocus={(e) => {
              addrFocused.current = true
              e.currentTarget.select()
            }}
            onBlur={() => {
              addrFocused.current = false
              setTimeout(() => setShowSug(false), 150)
            }}
            spellCheck={false}
            placeholder="Search or enter a URL…"
          />
          {showSug && editableAddress && (
            <div className="address-suggest">
              {sugg.map((s, i) => (
                <div
                  key={s.url}
                  className={`address-sug${i === sel ? ' sel' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    navTo(s.url)
                  }}
                >
                  <span className="address-sug-title">{s.title}</span>
                  <span className="address-sug-url">{s.url}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {wcReady != null && (
          <browser-action-list
            className="ext-actions"
            partition={partition}
            tab={wcReady}
            alignment="bottom right"
          />
        )}
        <button
          className="nav-btn"
          title="Open in Brave"
          onClick={() => void window.api.system.openInBrave(address)}
        >
          🦁
        </button>
      </div>
      {findOpen && (
        <div className="find-bar">
          <input
            ref={findRef}
            className="find-input"
            value={findText}
            placeholder="Find in page"
            spellCheck={false}
            onChange={(e) => {
              setFindText(e.target.value)
              runFind(e.target.value, false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runFind(findText, true, !e.shiftKey)
              else if (e.key === 'Escape') closeFind()
            }}
          />
          <span className="find-count">
            {findMatch.total ? `${findMatch.active}/${findMatch.total}` : findText ? '0/0' : ''}
          </span>
          <button
            className="nav-btn"
            title="Previous (⇧⏎)"
            disabled={!findMatch.total}
            onClick={() => runFind(findText, true, false)}
          >
            ‹
          </button>
          <button
            className="nav-btn"
            title="Next (⏎)"
            disabled={!findMatch.total}
            onClick={() => runFind(findText, true, true)}
          >
            ›
          </button>
          <button className="nav-btn" title="Close (Esc)" onClick={closeFind}>
            <Icon name="close" size={13} />
          </button>
        </div>
      )}
      <div className="browser-view" ref={hostRef} />
    </div>
  )
}
