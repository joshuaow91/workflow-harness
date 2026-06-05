import { useEffect, useState } from 'react'
import { settingsStore, useSettings } from '../lib/settingsStore'
import { normalizeInput } from '../lib/url'
import { TotpSection } from './TotpSection'
import { DatadogSettings } from './DatadogSettings'
import { MongoSettings } from './MongoSettings'
import { AutoUpdateSettings } from './AutoUpdateSettings'
import { RateLimitMeter } from './RateLimitMeter'

export function SettingsTab() {
  const settings = useSettings()
  const dir = settings?.defaultSessionDir ?? ''
  const [urlDraft, setUrlDraft] = useState('')

  // Keep the editable URL field in sync when settings load/change.
  useEffect(() => {
    if (settings?.defaultBrowserUrl) setUrlDraft(settings.defaultBrowserUrl)
  }, [settings?.defaultBrowserUrl])

  const chooseDir = async (): Promise<void> => {
    const picked = await window.api.system.pickDirectory(dir || window.api.system.homeDir)
    if (picked) await settingsStore.update({ defaultSessionDir: picked })
  }

  const saveUrl = (): void => {
    const url = normalizeInput(urlDraft)
    setUrlDraft(url)
    void settingsStore.update({ defaultBrowserUrl: url })
  }

  return (
    <div className="settings">
      <h1 className="settings-title">Settings</h1>

      <section className="settings-section">
        <div className="settings-label">Default directory for new claude sessions</div>
        <div className="settings-row">
          <code className="settings-path">{dir || '…'}</code>
          <button className="tbtn" onClick={chooseDir}>
            Choose…
          </button>
        </div>
        <p className="settings-hint">
          Used by “New Terminal” and the “new claude / shell” actions when no specific repo or
          session directory is given. Sessions launched from a repo, worktree, or existing session
          still use that location.
        </p>
      </section>

      <section className="settings-section">
        <div className="settings-label">Default page for new browser tabs</div>
        <div className="settings-row">
          <input
            className="settings-input"
            value={urlDraft}
            spellCheck={false}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveUrl()}
            placeholder="https://github.com"
          />
          <button className="tbtn" onClick={saveUrl}>
            Save
          </button>
        </div>
        <p className="settings-hint">
          New tabs in the Browser workspace (and new side browsers) open here.
        </p>
      </section>

      <section className="settings-section">
        <div className="settings-label">Claude sessions</div>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={settings?.injectRepoMap ?? true}
            onChange={(e) => void settingsStore.update({ injectRepoMap: e.target.checked })}
          />
          Inject the repo knowledge map into new claude sessions
        </label>
        <p className="settings-hint">
          When you launch claude from the harness, the workspace repo map (from the Knowledge tab) is
          passed via <code>--append-system-prompt-file</code>, so a session knows which repos a task
          touches without you naming them. Only applies once you’ve generated the map.
        </p>
      </section>

      <section className="settings-section">
        <div className="settings-label">Notifications</div>
        {(
          [
            ['notifyPrReview', 'A PR requests my review'],
            ['notifyPrMerged', 'One of my PRs is merged'],
            ['notifySessionResponse', 'A Claude session finishes and needs a response']
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="settings-toggle">
            <input
              type="checkbox"
              checked={settings?.[key] !== false}
              onChange={(e) => void settingsStore.update({ [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
        <p className="settings-hint">
          Native macOS notifications. Sessions that need a response also get a ring in the sidebar.
        </p>
      </section>

      <RateLimitMeter />

      <AutoUpdateSettings />

      <TotpSection />

      <DatadogSettings />

      <MongoSettings />

      <section className="settings-section">
        <div className="settings-label">GitHub sign-in</div>
        <p className="settings-hint" style={{ marginTop: 0 }}>
          The embedded GitHub views (Issues, Board, Review) use an in-app browser session that’s
          separate from the <code>gh</code> CLI — its token can’t be reused as a web login, and it’s
          also separate from your system browser’s cookies. Sign in to github.com{' '}
          <strong>once inside the app</strong> — on the Issues/Board/Review tab itself, or a Browser
          tab pointed at github.com. The session is saved on disk and shared across all embedded
          views, so you stay signed in across restarts.
        </p>
      </section>
    </div>
  )
}
