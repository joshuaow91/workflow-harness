import { settingsStore, useSettings } from '../lib/settingsStore'

export function SettingsTab() {
  const settings = useSettings()
  const dir = settings?.defaultSessionDir ?? ''

  const choose = async (): Promise<void> => {
    const picked = await window.api.system.pickDirectory(dir || window.api.system.homeDir)
    if (picked) await settingsStore.update({ defaultSessionDir: picked })
  }

  return (
    <div className="settings">
      <h1 className="settings-title">Settings</h1>

      <section className="settings-section">
        <div className="settings-label">Default directory for new claude sessions</div>
        <div className="settings-row">
          <code className="settings-path">{dir || '…'}</code>
          <button className="tbtn" onClick={choose}>
            Choose…
          </button>
        </div>
        <p className="settings-hint">
          Used by “New Terminal” and the “new claude / shell” actions when no specific repo or
          session directory is given. Sessions launched from a repo, worktree, or existing session
          still use that location.
        </p>
      </section>
    </div>
  )
}
