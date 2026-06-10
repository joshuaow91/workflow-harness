import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import type { GhRateLimit, GhRateResource } from '@shared/types'

function resetText(reset: number): string {
  if (!reset) return ''
  const ms = reset * 1000 - Date.now()
  const mins = Math.max(0, Math.round(ms / 60000))
  const when = new Date(reset * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `resets ${when} (${mins}m)`
}

function Bar({ label, r }: { label: string; r: GhRateResource }) {
  const used = r.limit ? r.limit - r.remaining : 0
  const pct = r.limit ? Math.round((used / r.limit) * 100) : 0
  const cls = pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : 'ok'
  return (
    <div className="rl-row">
      <div className="rl-top">
        <span className="rl-label">{label}</span>
        <span className="rl-nums">
          {r.remaining}/{r.limit} left · {resetText(r.reset)}
        </span>
      </div>
      <div className="rl-track">
        <div className={`rl-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function RateLimitMeter() {
  const [data, setData] = useState<GhRateLimit | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = (): void => {
    void window.api.github
      .rateLimit()
      .then((d) => {
        setData(d)
        setErr(null)
      })
      .catch((e) => setErr((e as Error).message))
  }
  useEffect(() => {
    load()
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
  }, [])

  return (
    <section className="settings-section">
      <div className="settings-label">GitHub API usage</div>
      {err ? (
        <p className="settings-hint">Couldn’t read rate limit: {err}</p>
      ) : !data ? (
        <p className="settings-hint">Checking…</p>
      ) : (
        <>
          <Bar label="GraphQL (board, PR/issue status)" r={data.graphql} />
          <Bar label="REST (lists, diffs, edits)" r={data.core} />
        </>
      )}
      <p className="settings-hint">
        Each teammate has their own ~5,000/hr budget. This reads <code>rate_limit</code>, which is
        free (doesn’t count against it). Refreshes every 30s.
      </p>
      <button className="tbtn" onClick={load}>
        <Icon name="refresh" size={14} /> Refresh
      </button>
    </section>
  )
}
