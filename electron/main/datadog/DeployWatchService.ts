import type {
  DeployDrill,
  DeployHealth,
  DeployInfo,
  DeployMetric,
  DeployResource,
  MetricVerdict
} from '@shared/types'
import { ddQuery, type DdSeries } from './ddClient'

// Deploy detection looks back this far for distinct `version` tags.
const DETECT_WINDOW_SEC = 48 * 3600
// Each comparison window (new-since-deploy vs. the equal stretch before it).
const COMPARE_WINDOW_MS = 60 * 60 * 1000
// Below this many requests on the new version, withhold a verdict.
const TRAFFIC_FLOOR = 50
// JVM/JIT is cold right after deploy; don't score until it settles.
const WARMUP_MS = 10 * 60 * 1000
// Relative-change thresholds for scoring a metric against its baseline.
const WARN_DELTA = 0.15
const BAD_DELTA = 0.4

// ---- tag / point helpers ----

function tagValue(scope: string, key: string): string | null {
  for (const part of scope.split(/[\s,]+/)) {
    const idx = part.indexOf(':')
    if (idx > 0 && part.slice(0, idx) === key) return part.slice(idx + 1)
  }
  return null
}

type Point = [number, number | null]

function within(points: Point[], fromMs: number, toMs: number): number[] {
  const out: number[] = []
  for (const [t, v] of points) if (v != null && t >= fromMs && t < toMs) out.push(v)
  return out
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0)
}
function avg(nums: number[]): number | null {
  return nums.length ? sum(nums) / nums.length : null
}

function firstSeen(points: Point[]): number | null {
  for (const [t, v] of points) if (v != null && v > 0) return t
  return null
}
function lastSeen(points: Point[]): number | null {
  let last: number | null = null
  for (const [t, v] of points) if (v != null && v > 0) last = t
  return last
}

// ---- deploy detection ----

export async function recentDeploys(service: string): Promise<DeployInfo[]> {
  const now = Date.now() / 1000
  const series = await ddQuery(
    `sum:trace.servlet.request.hits{service:${service}} by {version}.as_count()`,
    now - DETECT_WINDOW_SEC,
    now
  )
  const deploys: DeployInfo[] = []
  for (const s of series) {
    const version = tagValue(s.scope, 'version')
    if (!version) continue
    const seen = firstSeen(s.pointlist)
    if (seen == null) continue
    deploys.push({
      service,
      version,
      firstSeen: seen,
      lastSeen: lastSeen(s.pointlist),
      hits: sum(within(s.pointlist, 0, Infinity))
    })
  }
  // Newest deploy first (most recent first-seen = latest cutover).
  deploys.sort((a, b) => (b.firstSeen ?? 0) - (a.firstSeen ?? 0))
  return deploys
}

// ---- metric registry ----

interface MetricDef {
  key: string
  label: string
  tier: 1 | 2 | 3
  unit: string
  dir: 'lower' | 'higher' | 'info'
  /** How the windowed points reduce to one value. */
  reduce: 'avg' | 'sum' | 'rate'
  /** Primary metric query (with __S__ service placeholder, `by {version}`). */
  query: string
  /** For ratios (e.g. error rate): divide the summed primary by this summed query. */
  ratioOf?: string
}

const M = (svc: string, q: string): string => q.replaceAll('__S__', svc)

const METRICS: MetricDef[] = [
  // Tier 1 — request golden signals
  {
    key: 'error_rate',
    label: 'Error rate',
    tier: 1,
    unit: '%',
    dir: 'lower',
    reduce: 'sum',
    query: 'sum:trace.servlet.request.errors{service:__S__} by {version}.as_count()',
    ratioOf: 'sum:trace.servlet.request.hits{service:__S__} by {version}.as_count()'
  },
  { key: 'p50', label: 'Latency p50', tier: 1, unit: 's', dir: 'lower', reduce: 'avg', query: 'p50:trace.servlet.request{service:__S__} by {version}' },
  { key: 'p95', label: 'Latency p95', tier: 1, unit: 's', dir: 'lower', reduce: 'avg', query: 'p95:trace.servlet.request{service:__S__} by {version}' },
  { key: 'p99', label: 'Latency p99', tier: 1, unit: 's', dir: 'lower', reduce: 'avg', query: 'p99:trace.servlet.request{service:__S__} by {version}' },
  { key: 'throughput', label: 'Throughput', tier: 1, unit: 'req/s', dir: 'info', reduce: 'rate', query: 'sum:trace.servlet.request.hits{service:__S__} by {version}.as_count()' },
  { key: 'apdex', label: 'Apdex', tier: 1, unit: '', dir: 'higher', reduce: 'avg', query: 'avg:trace.servlet.request.apdex{service:__S__} by {version}' },
  // Tier 2 — downstream
  { key: 'mongo_p95', label: 'Mongo query p95', tier: 2, unit: 's', dir: 'lower', reduce: 'avg', query: 'p95:trace.mongo.query{service:__S__} by {version}' },
  { key: 'mongo_errors', label: 'Mongo errors', tier: 2, unit: '', dir: 'lower', reduce: 'sum', query: 'sum:trace.mongo.query.errors{service:__S__} by {version}.as_count()' },
  { key: 'redis_p95', label: 'Redis query p95', tier: 2, unit: 's', dir: 'lower', reduce: 'avg', query: 'p95:trace.redis.query{service:__S__} by {version}' },
  { key: 'http_out_p95', label: 'Outbound HTTP p95', tier: 2, unit: 's', dir: 'lower', reduce: 'avg', query: 'p95:trace.okhttp.request{service:__S__} by {version}' },
  { key: 'render_p95', label: 'Template render p95', tier: 2, unit: 's', dir: 'lower', reduce: 'avg', query: 'p95:trace.response.render{service:__S__} by {version}' },
  // Tier 3 — JVM / runtime
  {
    key: 'heap_util',
    label: 'Heap used',
    tier: 3,
    unit: '%',
    dir: 'lower',
    reduce: 'avg',
    query: 'avg:jvm.heap_memory{service:__S__} by {version}',
    ratioOf: 'avg:jvm.heap_memory_max{service:__S__} by {version}'
  },
  { key: 'gc_major', label: 'Major GC time', tier: 3, unit: 'ms', dir: 'lower', reduce: 'avg', query: 'avg:jvm.gc.major_collection_time{service:__S__} by {version}' },
  { key: 'threads', label: 'Thread count', tier: 3, unit: '', dir: 'lower', reduce: 'avg', query: 'avg:jvm.thread_count{service:__S__} by {version}' },
  { key: 'fds', label: 'Open file descriptors', tier: 3, unit: '', dir: 'lower', reduce: 'avg', query: 'avg:jvm.os.open_file_descriptors{service:__S__} by {version}' },
  { key: 'cpu', label: 'Process CPU', tier: 3, unit: '%', dir: 'info', reduce: 'avg', query: 'avg:jvm.cpu_load.process{service:__S__} by {version}' }
]

function seriesForVersion(series: DdSeries[], version: string): Point[] {
  return series.find((s) => tagValue(s.scope, 'version') === version)?.pointlist ?? []
}

/** Reduce one version's points within a window to a single scalar. */
function reduceWindow(
  points: Point[],
  reduce: MetricDef['reduce'],
  fromMs: number,
  toMs: number
): number | null {
  const vals = within(points, fromMs, toMs)
  if (reduce === 'sum') return vals.length ? sum(vals) : null
  if (reduce === 'rate') return vals.length ? sum(vals) / ((toMs - fromMs) / 1000) : null
  return avg(vals)
}

function scoreMetric(def: MetricDef, nv: number | null, pv: number | null): MetricVerdict {
  if (nv == null) return 'nodata'
  if (def.dir === 'info') return 'neutral'
  // Absolute guard: a real error rate is bad regardless of the baseline.
  if (def.key === 'error_rate' && nv >= 5) return 'bad'
  if (pv == null || pv === 0) {
    if (def.key === 'error_rate' && nv >= 1) return 'warn'
    return 'neutral'
  }
  const delta = (nv - pv) / pv
  const signed = def.dir === 'lower' ? delta : -delta
  if (def.key === 'error_rate' && nv >= 1 && signed < BAD_DELTA) return 'warn'
  if (signed >= BAD_DELTA) return 'bad'
  if (signed >= WARN_DELTA) return 'warn'
  if (signed <= -WARN_DELTA) return 'good'
  return 'neutral'
}

export async function deployHealth(
  service: string,
  newVersion: string,
  prevVersion: string | null,
  deployedAt: number
): Promise<DeployHealth> {
  const now = Date.now()
  // New window: from deploy up to one window's worth (or now, if sooner).
  const newFrom = deployedAt
  const newTo = Math.min(now, deployedAt + COMPARE_WINDOW_MS)
  const windowMs = newTo - newFrom
  // Prev window: the equal stretch immediately before the cutover.
  const prevTo = deployedAt
  const prevFrom = deployedAt - windowMs
  // One union query per (distinct) metric query covers both versions + windows.
  const unionFrom = prevFrom / 1000
  const unionTo = newTo / 1000

  const queryCache = new Map<string, Promise<DdSeries[]>>()
  const runQuery = (q: string): Promise<DdSeries[]> => {
    const key = M(service, q)
    let p = queryCache.get(key)
    if (!p) {
      p = ddQuery(key, unionFrom, unionTo).catch(() => [] as DdSeries[])
      queryCache.set(key, p)
    }
    return p
  }

  const metrics: DeployMetric[] = await Promise.all(
    METRICS.map(async (def): Promise<DeployMetric> => {
      const primary = await runQuery(def.query)
      const denom = def.ratioOf ? await runQuery(def.ratioOf) : null

      const value = (version: string, from: number, to: number): number | null => {
        const num = reduceWindow(seriesForVersion(primary, version), def.reduce, from, to)
        if (!denom) return num
        const den = reduceWindow(seriesForVersion(denom, version), 'avg', from, to)
        if (num == null || den == null || den === 0) return num == null ? null : 0
        // Ratio metrics (error rate, heap util) → numerator over denominator, percent.
        return (num / den) * 100
      }

      const nv = value(newVersion, newFrom, newTo)
      const pv = prevVersion ? value(prevVersion, prevFrom, prevTo) : null
      const deltaPct = nv != null && pv != null && pv !== 0 ? ((nv - pv) / pv) * 100 : null
      return {
        key: def.key,
        label: def.label,
        tier: def.tier,
        unit: def.unit,
        dir: def.dir,
        newValue: nv,
        prevValue: pv,
        deltaPct,
        verdict: scoreMetric(def, nv, pv)
      }
    })
  )

  // Traffic = new version's request hits within the window.
  const hitsSeries = await runQuery('sum:trace.servlet.request.hits{service:__S__} by {version}.as_count()')
  const traffic = sum(within(seriesForVersion(hitsSeries, newVersion), newFrom, newTo))

  const tier1 = metrics.filter((m) => m.tier === 1)
  const verdict: DeployHealth['verdict'] = (() => {
    if (traffic < TRAFFIC_FLOOR) return 'insufficient'
    if (now - deployedAt < WARMUP_MS) return 'warming'
    if (tier1.some((m) => m.verdict === 'bad')) return 'rollback'
    if (metrics.some((m) => m.verdict === 'bad' || m.verdict === 'warn')) return 'watch'
    if (metrics.every((m) => m.verdict === 'nodata')) return 'nodata'
    return 'healthy'
  })()

  return { service, newVersion, prevVersion, deployedAt, windowMs, traffic, verdict, metrics }
}

// ---- Hotspots: which specific operations regressed most for this deploy ----

const HITS_FLOOR_RESOURCE = 10

interface DrillFamily {
  family: string
  label: string
  unit: string
  /** p95 latency by resource_name, with __S__ service + __V__ version. */
  p95: string
  /** request count by resource_name (traffic floor). */
  hits: string
}

const FAMILIES: DrillFamily[] = [
  {
    family: 'endpoints',
    label: 'Slowest endpoints',
    unit: 's',
    p95: 'p95:trace.servlet.request{service:__S__,version:__V__} by {resource_name}',
    hits: 'sum:trace.servlet.request.hits{service:__S__,version:__V__} by {resource_name}.as_count()'
  },
  {
    family: 'mongo',
    label: 'Slowest Mongo queries',
    unit: 's',
    p95: 'p95:trace.mongo.query{service:__S__,version:__V__} by {resource_name}',
    hits: 'sum:trace.mongo.query.hits{service:__S__,version:__V__} by {resource_name}.as_count()'
  },
  {
    family: 'redis',
    label: 'Slowest Redis ops',
    unit: 's',
    p95: 'p95:trace.redis.query{service:__S__,version:__V__} by {resource_name}',
    hits: 'sum:trace.redis.query.hits{service:__S__,version:__V__} by {resource_name}.as_count()'
  },
  {
    family: 'http_out',
    label: 'Slowest outbound HTTP',
    unit: 's',
    p95: 'p95:trace.okhttp.request{service:__S__,version:__V__} by {resource_name}',
    hits: 'sum:trace.okhttp.request.hits{service:__S__,version:__V__} by {resource_name}.as_count()'
  }
]

function fill(tpl: string, service: string, version: string): string {
  return tpl.replaceAll('__S__', service).replaceAll('__V__', version)
}

function scoreLower(nv: number | null, pv: number | null): MetricVerdict {
  if (nv == null) return 'nodata'
  if (pv == null || pv === 0) return 'neutral'
  const d = (nv - pv) / pv
  if (d >= BAD_DELTA) return 'bad'
  if (d >= WARN_DELTA) return 'warn'
  if (d <= -WARN_DELTA) return 'good'
  return 'neutral'
}

// One query → resource_name → reduced scalar over its whole window.
async function byResource(
  tpl: string,
  service: string,
  version: string,
  fromSec: number,
  toSec: number,
  reduce: 'avg' | 'sum'
): Promise<Map<string, number>> {
  const series = await ddQuery(fill(tpl, service, version), fromSec, toSec).catch(
    () => [] as DdSeries[]
  )
  const m = new Map<string, number>()
  for (const s of series) {
    const r = tagValue(s.scope, 'resource_name')
    if (!r) continue
    const vals = within(s.pointlist, 0, Infinity)
    const v = reduce === 'sum' ? (vals.length ? sum(vals) : null) : avg(vals)
    if (v != null) m.set(r, v)
  }
  return m
}

async function rankFamily(
  fam: DrillFamily,
  service: string,
  newV: string,
  prevV: string | null,
  win: { newFrom: number; newTo: number; prevFrom: number; prevTo: number }
): Promise<DeployDrill> {
  const [p95New, p95Prev, hitsNew] = await Promise.all([
    byResource(fam.p95, service, newV, win.newFrom / 1000, win.newTo / 1000, 'avg'),
    prevV
      ? byResource(fam.p95, service, prevV, win.prevFrom / 1000, win.prevTo / 1000, 'avg')
      : Promise.resolve(new Map<string, number>()),
    byResource(fam.hits, service, newV, win.newFrom / 1000, win.newTo / 1000, 'sum')
  ])

  const rows: DeployResource[] = []
  for (const [resource, nv] of p95New) {
    const hits = hitsNew.get(resource) ?? 0
    if (hits < HITS_FLOOR_RESOURCE) continue
    const pv = p95Prev.get(resource) ?? null
    const deltaPct = pv != null && pv > 0 ? ((nv - pv) / pv) * 100 : null
    rows.push({ resource, newValue: nv, prevValue: pv, deltaPct, hits, verdict: scoreLower(nv, pv) })
  }
  // Rank by absolute latency regression (new − prev), tie-break by slowest now.
  const reg = (r: DeployResource): number => (r.newValue ?? 0) - (r.prevValue ?? 0)
  rows.sort((a, b) => reg(b) - reg(a) || (b.newValue ?? 0) - (a.newValue ?? 0))
  return { family: fam.family, label: fam.label, unit: fam.unit, rows: rows.slice(0, 6) }
}

export async function deployHotspots(
  service: string,
  newVersion: string,
  prevVersion: string | null,
  deployedAt: number
): Promise<DeployDrill[]> {
  const now = Date.now()
  const newFrom = deployedAt
  const newTo = Math.min(now, deployedAt + COMPARE_WINDOW_MS)
  const windowMs = newTo - newFrom
  const win = { newFrom, newTo, prevFrom: deployedAt - windowMs, prevTo: deployedAt }
  const drills = await Promise.all(FAMILIES.map((f) => rankFamily(f, service, newVersion, prevVersion, win)))
  return drills.filter((d) => d.rows.length > 0)
}
