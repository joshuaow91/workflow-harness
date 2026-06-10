import type { PrInRange } from '@shared/types'

// B1 culprit correlation: match a regressed APM resource (endpoint / query) to
// the in-deploy PR whose changed files sit on that code path — by name overlap.
// This is a SUSPECT, not proof: a slowdown can come from data growth or a shared
// dependency another PR bumped. We surface the matched file so it's auditable.

export interface Suspect {
  number: number
  url: string
  title: string
  /** The changed file that matched (basename), shown for auditability. */
  file: string
}

// Path params (_storeid_), HTTP verbs, API scaffolding, generic query verbs.
const RES_NOISE = new Set([
  'api', 'v1', 'v2', 'v3', 'store', 'stores', 'admin', 'settings',
  'get', 'post', 'put', 'delete', 'patch', 'options', 'head',
  'find', 'aggregate', 'query', 'insert', 'count', 'update', 'upsert',
  'id', 'storeid', 'sid', 'campaignid', 'appointmentid', 'conversationid',
  'customerid', 'agentid', 'storeuserid', 'runid', 'shortid', 'callid'
])

// Source-tree scaffolding + language/framework words that carry no signal.
const FILE_NOISE = new Set([
  'src', 'main', 'test', 'java', 'kt', 'ts', 'tsx', 'js', 'jsx', 'resources',
  'web', 'webapp', 'inf', 'com', 'blink', 'blinkai', 'server', 'dashboard',
  'impl', 'controller', 'controllers', 'service', 'services', 'repository',
  'repositories', 'model', 'models', 'dto', 'dtos', 'config', 'util', 'utils',
  'api', 'v1', 'v2', 'v3', 'index', 'handler', 'handlers'
])

function splitTokens(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase → words
    .split(/[^a-zA-Z0-9]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t))
}

export function resourceTokens(resource: string): string[] {
  // Strip "post_" method prefix and drop _param_ path segments.
  const cleaned = resource
    .replace(/^(get|post|put|delete|patch|options|head)_/i, '')
    .replace(/_[a-z0-9]+_/gi, '/')
  const toks = splitTokens(cleaned).filter((t) => !RES_NOISE.has(t))
  return Array.from(new Set(toks))
}

function fileTokens(path: string): Set<string> {
  return new Set(splitTokens(path).filter((t) => !FILE_NOISE.has(t)))
}

/** Best-matching PR for a regressed resource, or null if no confident overlap. */
export function suspectFor(
  resource: string,
  prs: PrInRange[],
  prFiles: Record<number, string[]>
): Suspect | null {
  const rtoks = resourceTokens(resource)
  if (rtoks.length === 0) return null

  let best: { pr: PrInRange; file: string; matched: number } | null = null
  for (const pr of prs) {
    for (const file of prFiles[pr.number] ?? []) {
      const ftoks = fileTokens(file)
      const matched = rtoks.filter((t) => ftoks.has(t)).length
      if (matched > 0 && (!best || matched > best.matched)) best = { pr, file, matched }
    }
  }
  if (!best) return null

  // Confidence gate: a single-token resource must match that token; multi-token
  // resources need at least half (and ≥2) of their tokens on one file.
  const need = rtoks.length === 1 ? 1 : Math.max(2, Math.ceil(rtoks.length * 0.5))
  if (best.matched < need) return null

  return {
    number: best.pr.number,
    url: best.pr.url,
    title: best.pr.title,
    file: best.file.split('/').pop() || best.file
  }
}
