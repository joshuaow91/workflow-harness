import { useEffect, useState } from 'react'
import { settingsStore, useSettings } from '../lib/settingsStore'

export function MongoSettings() {
  const s = useSettings()
  const [uri, setUri] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (s) setUri(s.mongoUri)
  }, [s?.mongoUri])

  const save = async (): Promise<void> => {
    await settingsStore.update({ mongoUri: uri.trim() })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <section className="settings-section">
      <div className="settings-label">MongoDB connection</div>
      <div className="settings-row">
        <input
          className="settings-input"
          type="password"
          placeholder="mongodb+srv://… (use a read-only URI)"
          value={uri}
          onChange={(e) => setUri(e.target.value)}
        />
        <button className="tbtn" onClick={save}>
          {saved ? '✓ Saved' : 'Save'}
        </button>
      </div>
      <p className="settings-hint">
        Used by the Mongo tab to browse databases/collections (read-only find/list only — no writes).
        Falls back to <code>MONGODB_URI</code> env. Stored locally in plaintext.
      </p>
    </section>
  )
}
