import { useEffect, useState } from 'react'
import type { MongoConnection } from '@shared/types'
import { settingsStore, useSettings } from '../lib/settingsStore'

export function MongoSettings() {
  const s = useSettings()
  const [conns, setConns] = useState<MongoConnection[]>([])
  const [saved, setSaved] = useState(false)

  // Seed from saved connections, migrating a legacy single mongoUri into a row.
  useEffect(() => {
    if (!s) return
    if (s.mongoConnections?.length) setConns(s.mongoConnections)
    else if (s.mongoUri) setConns([{ name: 'Prod (read-only)', uri: s.mongoUri }])
    else setConns([])
  }, [s?.mongoConnections, s?.mongoUri])

  const setRow = (i: number, patch: Partial<MongoConnection>): void =>
    setConns((c) => c.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const addRow = (): void => setConns((c) => [...c, { name: '', uri: '' }])
  const removeRow = (i: number): void => setConns((c) => c.filter((_, j) => j !== i))

  const save = async (): Promise<void> => {
    const cleaned = conns
      .map((c) => ({ name: c.name.trim(), uri: c.uri.trim() }))
      .filter((c) => c.name && c.uri)
    // Keep mongoUri pointing at the first connection so older code paths and the
    // env fallback still resolve to something sensible.
    await settingsStore.update({ mongoConnections: cleaned, mongoUri: cleaned[0]?.uri ?? '' })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <section className="settings-section">
      <div className="settings-label">MongoDB connections</div>
      {conns.map((c, i) => (
        <div className="settings-row" key={i} style={{ gap: 8, marginBottom: 6 }}>
          <input
            className="settings-input"
            style={{ maxWidth: 170 }}
            placeholder="name (e.g. Local)"
            value={c.name}
            onChange={(e) => setRow(i, { name: e.target.value })}
          />
          <input
            className="settings-input"
            type="password"
            placeholder="mongodb://localhost:27017 or mongodb+srv://…"
            value={c.uri}
            onChange={(e) => setRow(i, { uri: e.target.value })}
          />
          <button className="tbtn" onClick={() => removeRow(i)} title="Remove connection">
            ✕
          </button>
        </div>
      ))}
      <div className="settings-row">
        <button className="tbtn" onClick={addRow}>
          ＋ Add connection
        </button>
        <button className="tbtn" onClick={save}>
          {saved ? '✓ Saved' : 'Save'}
        </button>
      </div>
      <p className="settings-hint">
        Switch between connections from the picker in the Mongo tab (e.g. read-only Prod and your
        Local DB). Read-only find/list only — no writes. Falls back to <code>MONGODB_URI</code> env.
        Stored locally in plaintext.
      </p>
    </section>
  )
}
