import { useEffect, useState } from 'react'
import { settingsStore, useSettings } from '../lib/settingsStore'
import { normalizeInput } from '../lib/url'

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
