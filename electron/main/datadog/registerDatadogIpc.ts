import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { DatadogDashboard } from '@shared/types'
import { ddCreds, NO_DD_KEYS } from './ddClient'
import { recentDeploys, deployHealth, deployHotspots } from './DeployWatchService'

export { NO_DD_KEYS }

async function listDashboards(): Promise<DatadogDashboard[]> {
  const { api, app, site } = ddCreds()
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
  ipcMain.handle(IPC.datadog.deploys, (_e, service: string) => recentDeploys(service))
  ipcMain.handle(
    IPC.datadog.deployHealth,
    (_e, service: string, newVersion: string, prevVersion: string | null, deployedAt: number) =>
      deployHealth(service, newVersion, prevVersion, deployedAt)
  )
  ipcMain.handle(
    IPC.datadog.deployHotspots,
    (_e, service: string, newVersion: string, prevVersion: string | null, deployedAt: number) =>
      deployHotspots(service, newVersion, prevVersion, deployedAt)
  )
}
