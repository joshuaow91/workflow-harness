import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { DatadogDashboard } from '@shared/types'
import { getSettings } from '../settings/SettingsStore'

export const NO_DD_KEYS = 'NO_DD_KEYS'

function creds(): { api: string; app: string; site: string } {
  const s = getSettings()
  return {
    api: s.ddApiKey || process.env.DD_API_KEY || '',
    app: s.ddAppKey || process.env.DD_APP_KEY || '',
    site: s.ddSite || process.env.DD_SITE || 'datadoghq.com'
  }
}

async function listDashboards(): Promise<DatadogDashboard[]> {
  const { api, app, site } = creds()
  if (!api || !app) throw new Error(NO_DD_KEYS)

  const res = await fetch(`https://api.${site}/api/v1/dashboard`, {
    headers: { 'DD-API-KEY': api, 'DD-APPLICATION-KEY': app }
  })
  if (!res.ok) {
    throw new Error(`Datadog API error ${res.status}${res.status === 403 ? ' (check key scopes)' : ''}`)
  }
  const json = (await res.json()) as { dashboards?: { id: string; title: string; url?: string }[] }
  const appBase = `https://app.${site}`
  return (json.dashboards ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    url: d.url ? `${appBase}${d.url}` : `${appBase}/dashboard/${d.id}`,
    custom: /[a-z]/i.test(d.id)
  }))
}

export function registerDatadogIpc(): void {
  ipcMain.handle(IPC.datadog.listDashboards, () => listDashboards())
}
