import { useEffect, useState } from 'react'
import { settingsStore, useSettings } from '../lib/settingsStore'

export function DatadogSettings() {
  const s = useSettings()
  const [api, setApi] = useState('')
  const [app, setApp] = useState('')
  const [site, setSite] = useState('datadoghq.com')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (s) {
      setApi(s.ddApiKey)
      setApp(s.ddAppKey)
      setSite(s.ddSite || 'datadoghq.com')
    }
  }, [s?.ddApiKey, s?.ddAppKey, s?.ddSite])

  const save = async (): Promise<void> => {
    await settingsStore.update({
      ddApiKey: api.trim(),
      ddAppKey: app.trim(),
      ddSite: site.trim() || 'datadoghq.com'
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <section className="settings-section">
      <div className="settings-label">Datadog API access</div>
      <div className="settings-row">
        <input
          className="settings-input"
          type="password"
          placeholder="DD_API_KEY"
          value={api}
          onChange={(e) => setApi(e.target.value)}
        />
      </div>
      <div className="settings-row" style={{ marginTop: 8 }}>
        <input
          className="settings-input"
          type="password"
          placeholder="DD_APP_KEY"
          value={app}
          onChange={(e) => setApp(e.target.value)}
        />
      </div>
      <div className="settings-row" style={{ marginTop: 8 }}>
        <input
          className="settings-input"
          placeholder="site (datadoghq.com)"
          value={site}
          onChange={(e) => setSite(e.target.value)}
        />
        <button className="tbtn" onClick={save}>
          {saved ? '✓ Saved' : 'Save'}
        </button>
      </div>
      <p className="settings-hint">
        Lists your dashboards natively in the Datadog tab. Falls back to{' '}
        <code>DD_API_KEY</code>/<code>DD_APP_KEY</code>/<code>DD_SITE</code> env vars. Stored locally
        in plaintext.
      </p>
    </section>
  )
}
