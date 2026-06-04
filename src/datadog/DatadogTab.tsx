import { useState } from 'react'
import { TabbedWebView } from '../components/TabbedWebView'

// Default to the US1 site; users on another DD site can navigate from here.
const DD = 'https://app.datadoghq.com'

const LINKS: [string, string][] = [
  ['Dashboards', '/dashboard/lists'],
  ['Monitors', '/monitors/manage'],
  ['Notebooks', '/notebook/list'],
  ['Logs', '/logs'],
  ['APM', '/apm/traces']
]

export function DatadogTab() {
  const [path, setPath] = useState('/dashboard/lists')

  return (
    <TabbedWebView
      homeUrl={DD + path}
      homeLabel="Datadog"
      headerRight={
        <div className="dd-links">
          {LINKS.map(([label, p]) => (
            <button
              key={p}
              className={`dd-link${p === path ? ' active' : ''}`}
              onClick={() => setPath(p)}
            >
              {label}
            </button>
          ))}
        </div>
      }
    />
  )
}
