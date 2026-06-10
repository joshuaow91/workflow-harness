import { getSettings } from '../settings/SettingsStore'

// Thrown (as an Error message) when Datadog keys aren't configured; the renderer
// checks for this substring to show the "add keys" placeholder.
export const NO_DD_KEYS = 'NO_DD_KEYS'

export function ddCreds(): { api: string; app: string; site: string } {
  const s = getSettings()
  return {
    api: s.ddApiKey || process.env.DD_API_KEY || '',
    app: s.ddAppKey || process.env.DD_APP_KEY || '',
    site: s.ddSite || process.env.DD_SITE || 'datadoghq.com'
  }
}

export interface DdSeries {
  /** Tag scope, e.g. "service:blink-server,version:b6d41bc". */
  scope: string
  /** [timestampMs, value] points; value may be null for gaps. */
  pointlist: [number, number | null][]
}

/** Run a Datadog timeseries query over [fromSec, toSec] and return its series. */
export async function ddQuery(query: string, fromSec: number, toSec: number): Promise<DdSeries[]> {
  const { api, app, site } = ddCreds()
  if (!api || !app) throw new Error(NO_DD_KEYS)

  const url =
    `https://api.${site}/api/v1/query?from=${Math.floor(fromSec)}&to=${Math.floor(toSec)}` +
    `&query=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: { 'DD-API-KEY': api, 'DD-APPLICATION-KEY': app }
  })
  if (!res.ok) {
    throw new Error(`Datadog API error ${res.status}${res.status === 403 ? ' (check key scopes)' : ''}`)
  }
  const json = (await res.json()) as { series?: { scope?: string; pointlist?: [number, number | null][] }[] }
  return (json.series ?? []).map((s) => ({
    scope: s.scope ?? '',
    pointlist: s.pointlist ?? []
  }))
}
