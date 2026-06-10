import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type {
  DeployDrill,
  DeployHealth,
  DeployInfo,
  DeployMetric,
  DeployResource,
  DeployVerdict,
  PrInRange
} from '@shared/types'
import { useAsync } from '../lib/useAsync'
import { relativeTime } from '../lib/time'
import { Dropdown } from '../components/Dropdown'
import { PrRow } from '../panes/PrRow'
import { suspectFor, type Suspect } from './culprit'

// Repo → APM service: underscores become hyphens (blink_server → blink-server).
function serviceForRepo(repoName: string): string {
  return repoName.replace(/_/g, '-')
}

const VERDICT_LABEL: Record<DeployVerdict, string> = {
  healthy: 'Healthy',
  watch: 'Watch',
  rollback: 'Rollback candidate',
  warming: 'Warming up',
  insufficient: 'Insufficient traffic',
  nodata: 'No data'
}

const VC = { bad: '#e85d5d', warn: '#e0a93f', good: '#58c07a', neutral: 'var(--border)' }

function formatValue(v: number | null, unit: string): string {
  if (v == null) return '—'
  if (unit === '%') return `${v.toFixed(v < 10 ? 2 : 1)}%`
  if (unit === 's') return v < 1 ? `${(v * 1000).toFixed(0)}ms` : `${v.toFixed(2)}s`
  if (unit === 'ms') return `${v.toFixed(0)}ms`
  if (unit === 'req/s') return `${v.toFixed(1)}/s`
  return v >= 100 ? v.toFixed(0) : v.toFixed(1)
}

function deltaText(m: DeployMetric): string | null {
  if (m.deltaPct == null || m.dir === 'info') return null
  const big = Math.abs(m.deltaPct) >= 100
  return `${m.deltaPct >= 0 ? '+' : ''}${m.deltaPct.toFixed(big ? 0 : 1)}%`
}

// ---- KPI tile ----

function Tile({ m }: { m: DeployMetric | undefined }) {
  if (!m) return null
  const delta = deltaText(m)
  return (
    <div className={`dw-tile v-${m.verdict}`}>
      <div className="dw-tile-label">{m.label}</div>
      <div className="dw-tile-val">{formatValue(m.newValue, m.unit)}</div>
      <div className="dw-tile-foot">
        <span className="dw-tile-prev">was {formatValue(m.prevValue, m.unit)}</span>
        {delta && <span className={`dw-tile-delta v-${m.verdict}`}>{delta}</span>}
      </div>
    </div>
  )
}

// ---- Verdict donut (distribution of metric verdicts) ----

function VerdictDonut({ metrics }: { metrics: DeployMetric[] }) {
  const scored = metrics.filter((m) => m.dir !== 'info' && m.verdict !== 'nodata')
  const counts = { bad: 0, warn: 0, good: 0, neutral: 0 }
  for (const m of scored) counts[m.verdict as keyof typeof counts]++
  const total = scored.length || 1
  const segs = [
    { k: 'bad', c: VC.bad, n: counts.bad },
    { k: 'warn', c: VC.warn, n: counts.warn },
    { k: 'good', c: VC.good, n: counts.good },
    { k: 'neutral', c: VC.neutral, n: counts.neutral }
  ]
  const r = 34
  const circ = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="dw-donut-wrap">
      <svg width="92" height="92" viewBox="0 0 92 92" className="dw-donut">
        <circle cx="46" cy="46" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
        <g transform="rotate(-90 46 46)">
          {segs.map((s) => {
            if (s.n === 0) return null
            const len = (s.n / total) * circ
            const el = (
              <circle
                key={s.k}
                cx="46"
                cy="46"
                r={r}
                fill="none"
                stroke={s.c}
                strokeWidth="10"
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
              />
            )
            offset += len
            return el
          })}
        </g>
        <text x="46" y="51" textAnchor="middle" className="dw-donut-center">
          {scored.length}
        </text>
      </svg>
      <div className="dw-donut-legend">
        {segs
          .filter((s) => s.n > 0)
          .map((s) => (
            <span key={s.k} className="dw-leg">
              <i style={{ background: s.c }} />
              {s.n} {s.k}
            </span>
          ))}
      </div>
    </div>
  )
}

// ---- Metric row: explicit Before / After bars (responsive via container query) ----

function Bar({ value, max, cls }: { value: number | null; max: number; cls: string }) {
  const pct = value == null ? 0 : Math.max(2, (value / max) * 100)
  return (
    <div className="dw-bar-track">
      {value != null && <div className={`dw-bar-fill ${cls}`} style={{ width: `${pct}%` }} />}
    </div>
  )
}

function MetricRow({ m }: { m: DeployMetric }) {
  const max = Math.max(m.newValue ?? 0, m.prevValue ?? 0) || 1
  const delta = deltaText(m)
  return (
    <div className={`dw-metric v-${m.verdict}`}>
      <div className="dw-metric-top">
        <span className="dw-metric-label">{m.label}</span>
        {delta && <span className={`dw-metric-delta v-${m.verdict}`}>{delta}</span>}
      </div>
      <div className="dw-metric-cmp">
        <div className="dw-side">
          <span className="dw-side-tag">Before</span>
          <Bar value={m.prevValue} max={max} cls="prev" />
          <span className="dw-side-val">{formatValue(m.prevValue, m.unit)}</span>
        </div>
        <div className="dw-side">
          <span className="dw-side-tag">After</span>
          <Bar value={m.newValue} max={max} cls={`v-${m.verdict}`} />
          <span className={`dw-side-val after v-${m.verdict}`}>
            {formatValue(m.newValue, m.unit)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ---- Hotspots: the specific worst-regressed operations ----

function prettyResource(r: string): string {
  const m = r.match(/^(get|post|put|delete|patch|options|head)_(\/.*)$/i)
  if (m) {
    const path = m[2].replace(/_([a-z0-9]+)_/gi, '{$1}').replace(/_$/, '')
    return `${m[1].toUpperCase()} ${path}`
  }
  return r
}

function HotspotRow({ r, unit, suspect }: { r: DeployResource; unit: string; suspect: Suspect | null }) {
  const delta =
    r.deltaPct == null
      ? null
      : `${r.deltaPct >= 0 ? '+' : ''}${r.deltaPct.toFixed(Math.abs(r.deltaPct) >= 100 ? 0 : 1)}%`
  return (
    <div className={`dw-hot v-${r.verdict}`}>
      <div className="dw-hot-main">
        <span className="dw-hot-name" title={`${r.resource}\n${Math.round(r.hits)} req`}>
          {prettyResource(r.resource)}
        </span>
        {suspect && (
          <button
            className="dw-suspect"
            title={`Suspect — #${suspect.number} changed ${suspect.file}\n${suspect.title}\n\n(name-overlap guess, not proof)`}
            onClick={() => void window.api.system.openExternal(suspect.url)}
          >
            suspect #{suspect.number}
          </button>
        )}
      </div>
      <span className="dw-hot-vals">
        <span className="dw-metric-prev">{formatValue(r.prevValue, unit)}</span>
        <span className="dw-metric-arrow">→</span>
        <span className={`dw-hot-new v-${r.verdict}`}>{formatValue(r.newValue, unit)}</span>
      </span>
      <span className={`dw-metric-delta v-${r.verdict}`}>{delta ?? 'new'}</span>
    </div>
  )
}

function Hotspots({
  drills,
  loading,
  prs,
  prFiles
}: {
  drills: DeployDrill[]
  loading: boolean
  prs: PrInRange[]
  prFiles: Record<number, string[]>
}) {
  if (loading && drills.length === 0)
    return <div className="dw-section-title">Hotspots — scanning operations…</div>
  if (!drills.length) return null
  const haveFiles = Object.keys(prFiles).length > 0
  return (
    <div className="dw-hotspots">
      <div className="dw-section-title">Hotspots — worst operations in this deploy</div>
      {drills.map((d) => (
        <div key={d.family} className="dw-tier">
          <div className="dw-tier-head">{d.label}</div>
          {d.rows.map((r) => (
            <HotspotRow
              key={r.resource}
              r={r}
              unit={d.unit}
              suspect={haveFiles ? suspectFor(r.resource, prs, prFiles) : null}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function Comparison({
  health,
  loading,
  error,
  drills,
  drillsLoading,
  prs,
  prFiles,
  selectedPr,
  repo
}: {
  health: DeployHealth | null
  loading: boolean
  error: string | null
  drills: DeployDrill[]
  drillsLoading: boolean
  prs: PrInRange[]
  prFiles: Record<number, string[]>
  selectedPr: PrInRange | null
  repo: string | null
}) {
  if (error?.includes('NO_DD_KEYS'))
    return (
      <div className="placeholder">
        <div className="ph-emoji">🚀</div>
        <div className="ph-title">Datadog keys needed</div>
        <div className="ph-sub">
          Add <code>DD_API_KEY</code> and <code>DD_APP_KEY</code> in Settings → Datadog to detect
          deploys and read post-deploy metrics.
        </div>
      </div>
    )
  if (loading && !health) return <div className="side-term-hint">Loading deploy health…</div>
  if (error) return <div className="gh-state gh-error">{error}</div>
  if (!health)
    return (
      <div className="placeholder">
        <div className="ph-sub">Select a deploy.</div>
      </div>
    )

  const byKey = Object.fromEntries(health.metrics.map((m) => [m.key, m]))
  const tiers: { tier: 1 | 2 | 3; label: string }[] = [
    { tier: 1, label: 'Requests' },
    { tier: 2, label: 'Downstream' },
    { tier: 3, label: 'JVM / runtime' }
  ]

  return (
    <div className="dw-compare">
      <div className="dw-compare-head">
        <div className="dw-verdict-line">
          <span className={`dw-verdict v-${health.verdict}`}>{VERDICT_LABEL[health.verdict]}</span>
          <span className="dw-versions">
            <code>{health.newVersion}</code>
            {health.prevVersion && (
              <>
                {' '}vs{' '}
                <code>{health.prevVersion}</code>
              </>
            )}
          </span>
        </div>
        <div className="dw-compare-sub">
          {Math.round(health.windowMs / 60000)}-min window · {Math.round(health.traffic)} req
          {health.verdict === 'warming' && ' · warming up — JVM still settling'}
          {health.verdict === 'insufficient' && ' · too little traffic to judge yet'}
        </div>
      </div>

      <div className="dw-hero">
        <VerdictDonut metrics={health.metrics} />
        <div className="dw-tiles">
          <Tile m={byKey['error_rate']} />
          <Tile m={byKey['p95']} />
          <Tile m={byKey['p99']} />
          <Tile m={byKey['throughput']} />
        </div>
      </div>

      {selectedPr && repo && (
        <div className="dw-pr-detail">
          <PrRow link={{ kind: 'pr', repo, number: selectedPr.number, url: selectedPr.url }} />
        </div>
      )}

      <div className="dw-tiers">
        {tiers.map((t) => {
          const rows = health.metrics.filter((m) => m.tier === t.tier)
          if (!rows.length) return null
          return (
            <div key={t.tier} className="dw-tier">
              <div className="dw-tier-head">{t.label}</div>
              {rows.map((m) => (
                <MetricRow key={m.key} m={m} />
              ))}
            </div>
          )
        })}
      </div>

      <Hotspots drills={drills} loading={drillsLoading} prs={prs} prFiles={prFiles} />
    </div>
  )
}

export function DeployWatchTab() {
  const repos = useAsync(() => window.api.worktree.listRepos(), [])

  // Services we can resolve a repo for (needed to list the PRs in a deploy).
  const services = useMemo(() => {
    const list = (repos.data ?? [])
      .filter((r) => r.nameWithOwner)
      .map((r) => ({ service: serviceForRepo(r.name), repo: r.nameWithOwner as string }))
    const seen = new Set<string>()
    return list.filter((s) => (seen.has(s.service) ? false : seen.add(s.service)))
  }, [repos.data])

  const [service, setService] = useState<string>('')
  useEffect(() => {
    if (!service && services.length) {
      const def =
        services.find((s) => s.service === 'blink-server') ??
        services.find((s) => s.service.endsWith('-server')) ??
        services[0]
      setService(def.service)
    }
  }, [service, services])

  const repo = services.find((s) => s.service === service)?.repo ?? null

  const deploysQ = useAsync<DeployInfo[]>(
    () => (service ? window.api.datadog.deploys(service) : Promise.resolve([])),
    [service]
  )
  const deploys = deploysQ.data ?? []

  const [selectedIdx, setSelectedIdx] = useState(0)
  useEffect(() => {
    setSelectedIdx(0)
  }, [service])

  const selected = deploys[selectedIdx] ?? null
  const prevVersion = deploys[selectedIdx + 1]?.version ?? null

  const healthQ = useAsync<DeployHealth | null>(
    () =>
      selected && selected.firstSeen
        ? window.api.datadog.deployHealth(service, selected.version, prevVersion, selected.firstSeen)
        : Promise.resolve(null),
    [service, selected?.version, prevVersion]
  )

  const hotspotsQ = useAsync<DeployDrill[]>(
    () =>
      selected && selected.firstSeen
        ? window.api.datadog.deployHotspots(service, selected.version, prevVersion, selected.firstSeen)
        : Promise.resolve([]),
    [service, selected?.version, prevVersion]
  )

  const prsQ = useAsync<PrInRange[]>(
    () =>
      repo && selected && prevVersion
        ? window.api.github.prsInRange(repo, prevVersion, selected.version)
        : Promise.resolve([]),
    [repo, selected?.version, prevVersion]
  )
  const prs = prsQ.data ?? []

  // Changed files for every in-deploy PR — feeds the Hotspot culprit correlation.
  const prNumsKey = prs.map((p) => p.number).join(',')
  const prFilesQ = useAsync<Record<number, string[]>>(async () => {
    if (!repo || prs.length === 0) return {}
    const entries = await Promise.all(
      prs.map(async (p) => [p.number, await window.api.github.prFiles(repo, p.number).catch(() => [])] as const)
    )
    return Object.fromEntries(entries)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, prNumsKey])
  const prFiles = prFilesQ.data ?? {}

  const [selectedPrNum, setSelectedPrNum] = useState<number | null>(null)
  useEffect(() => {
    setSelectedPrNum(null)
  }, [selected?.version])
  const selectedPr = prs.find((p) => p.number === selectedPrNum) ?? null

  if (services.length === 0 && !repos.loading) {
    return (
      <div className="placeholder">
        <div className="ph-emoji">🚀</div>
        <div className="ph-title">No deployable repos found</div>
        <div className="ph-sub">
          Deploy Watch maps a repo to its Datadog service by name (e.g. blink_server →
          blink-server).
        </div>
      </div>
    )
  }

  return (
    <div className="dw-tab">
      <PanelGroup direction="horizontal" autoSaveId="dw-h">
        <Panel defaultSize={20} minSize={14}>
          <div className="dw-col">
            <div className="dw-colbar">
              <Dropdown
                value={service}
                options={services.map((s) => ({ value: s.service, label: s.service }))}
                onChange={setService}
                searchable
                minWidth={180}
              />
              <button className="term-act" title="Refresh" onClick={deploysQ.reload}>
                <Icon name="refresh" size={14} />
              </button>
            </div>
            <div className="dw-deploys">
              {deploysQ.loading && <div className="side-term-hint">Detecting deploys…</div>}
              {deploysQ.error && !deploysQ.error.includes('NO_DD_KEYS') && (
                <div className="gh-state gh-error">{deploysQ.error}</div>
              )}
              {deploysQ.error?.includes('NO_DD_KEYS') && (
                <div className="side-term-hint">Add Datadog keys in Settings.</div>
              )}
              {!deploysQ.loading && !deploysQ.error && deploys.length === 0 && (
                <div className="side-term-hint">No version-tagged traffic for {service}.</div>
              )}
              {deploys.map((d, i) => (
                <button
                  key={d.version}
                  className={`dw-deploy${i === selectedIdx ? ' sel' : ''}`}
                  onClick={() => setSelectedIdx(i)}
                >
                  <span className="dw-deploy-sha">{d.version}</span>
                  <span className="dw-deploy-meta">
                    {i === 0 && <span className="dw-latest">latest</span>}
                    {d.firstSeen ? relativeTime(new Date(d.firstSeen).toISOString()) : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel defaultSize={22} minSize={14}>
          <div className="dw-col">
            <div className="dw-colhead">PRs in this deploy</div>
            <div className="dw-prs">
              {prsQ.loading && <div className="side-term-hint">Resolving PRs…</div>}
              {!prsQ.loading && !prevVersion && (
                <div className="side-term-hint">No earlier deploy to diff against.</div>
              )}
              {!prsQ.loading && prevVersion && prs.length === 0 && (
                <div className="side-term-hint">No PRs found in this range.</div>
              )}
              {prs.map((p) => (
                <button
                  key={p.number}
                  className={`dw-pr${p.number === selectedPrNum ? ' sel' : ''}`}
                  onClick={() => setSelectedPrNum(p.number)}
                  title={p.title}
                >
                  <span className="dw-pr-num">#{p.number}</span>
                  <span className="dw-pr-title">{p.title}</span>
                </button>
              ))}
            </div>
          </div>
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel defaultSize={58} minSize={30}>
          <div className="dw-view">
            <Comparison
              health={healthQ.data ?? null}
              loading={healthQ.loading}
              error={healthQ.error}
              drills={hotspotsQ.data ?? []}
              drillsLoading={hotspotsQ.loading}
              prs={prs}
              prFiles={prFiles}
              selectedPr={selectedPr}
              repo={repo}
            />
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
