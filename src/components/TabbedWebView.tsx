import { useEffect, useRef, useState, type ReactNode } from 'react'
import { browserRouter } from '../lib/browserRouter'
import { WebFrame } from '../panes/WebFrame'

interface Tab {
  id: number
  url: string
  title: string
  home?: boolean
}

// An embedded web view with its own tab strip. "Open link in new tab" from any
// of its webviews adds a tab HERE (routed by source webContents id), so e.g. the
// Issues view keeps issues in its own tabs instead of the Browser workspace.
export function TabbedWebView({
  homeUrl,
  homeLabel = 'Home',
  headerRight
}: {
  homeUrl: string
  homeLabel?: string
  headerRight?: ReactNode
}) {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 0, url: homeUrl, title: homeLabel, home: true }])
  const [active, setActive] = useState(0)
  const counter = useRef(1)
  const wcIds = useRef<Record<number, number>>({})

  // Re-point the home tab when its URL changes (e.g. repo switch).
  useEffect(() => {
    setTabs((t) => t.map((x) => (x.home ? { ...x, url: homeUrl } : x)))
  }, [homeUrl])

  useEffect(() => {
    return browserRouter.register({
      ownsWc: (wc) => Object.values(wcIds.current).includes(wc),
      addTab: (url) => {
        const id = counter.current++
        setTabs((t) => [...t, { id, url, title: '…' }])
        setActive(id)
      }
    })
  }, [])

  const close = (id: number): void => {
    delete wcIds.current[id]
    setTabs((t) => {
      const next = t.filter((x) => x.id !== id)
      if (id === active && next.length) setActive(next[next.length - 1].id)
      return next
    })
  }

  return (
    <div className="twv">
      <div className="twv-strip">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`twv-tab${tab.id === active ? ' active' : ''}`}
            onClick={() => setActive(tab.id)}
            title={tab.url}
          >
            <span className="twv-tab-title">{tab.home ? homeLabel : tab.title}</span>
            {!tab.home && (
              <button
                className="twv-x"
                onClick={(e) => {
                  e.stopPropagation()
                  close(tab.id)
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {headerRight && <div className="twv-header-right">{headerRight}</div>}
      </div>
      <div className="twv-body">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="twv-layer"
            style={{ display: tab.id === active ? 'block' : 'none' }}
          >
            <WebFrame
              src={tab.url}
              editableAddress={false}
              onActivate={(id) => {
                wcIds.current[tab.id] = id
              }}
              onTitle={(t) =>
                setTabs((prev) => prev.map((x) => (x.id === tab.id && !x.home ? { ...x, title: t } : x)))
              }
            />
          </div>
        ))}
      </div>
    </div>
  )
}
