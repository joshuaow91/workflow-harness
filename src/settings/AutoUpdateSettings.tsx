import { useEffect, useState } from 'react'
import type { AppSettings, AutoUpdateStatus } from '@shared/types'
import { settingsStore, useSettings } from '../lib/settingsStore'
import { Dropdown } from '../components/Dropdown'
import { relativeTime } from '../lib/time'

export function AutoUpdateSettings() {
  const settings = useSettings()
  const [status, setStatus] = useState<AutoUpdateStatus | null>(null)
  const [running, setRunning] = useState(false)

  const refresh = (): void => void window.api.autoUpdate.status().then(setStatus)
  useEffect(() => refresh(), [])

  const runNow = async (): Promise<void> => {
    setRunning(true)
    try {
      await window.api.autoUpdate.runNow()
    } finally {
      setRunning(false)
      refresh()
    }
  }

  const interval = settings?.autoUpdateRepos ?? 'off'
  const updated = status?.results.filter((r) => r.status === 'updated').length ?? 0
  const skipped = status?.results.filter((r) => r.status === 'skipped').length ?? 0
  const busy = running || status?.running

  return (
    <section className="settings-section">
      <div className="settings-label">Auto-update repos (fast-forward only)</div>
      <div className="settings-row">
        <Dropdown
          value={interval}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'hourly', label: 'Hourly' },
            { value: 'daily', label: 'Daily' }
          ]}
          onChange={(v) => void settingsStore.update({ autoUpdateRepos: v as AppSettings['autoUpdateRepos'] })}
          minWidth={120}
        />
        <button className="tbtn" onClick={runNow} disabled={busy}>
          {busy ? 'Updating…' : 'Update now'}
        </button>
      </div>
      {status?.lastRunAt && (
        <p className="settings-hint">
          Last run {relativeTime(new Date(status.lastRunAt).toISOString())}: {updated} updated,{' '}
          {skipped} skipped.
        </p>
      )}
      <p className="settings-hint">
        Fetches every repo and fast-forwards each worktree from its upstream. Anything with
        uncommitted changes or a diverged branch is <strong>skipped</strong> (never merged or
        rebased), so your in-progress work is never touched.
      </p>
    </section>
  )
}
