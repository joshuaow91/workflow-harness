import { useEffect, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useAsync } from '../lib/useAsync'
import { Dropdown } from '../components/Dropdown'

const SYSTEM_DBS = ['admin', 'local', 'config']

function MissingUri() {
  return (
    <div className="placeholder">
      <div className="ph-emoji">🗄️</div>
      <div className="ph-title">MongoDB connection needed</div>
      <div className="ph-sub">
        Add a connection string in Settings → MongoDB (a read-only URI is recommended), then reopen
        this tab.
      </div>
    </div>
  )
}

export function MongoTab() {
  const dbs = useAsync(() => window.api.mongo.listDatabases(), [])
  const [db, setDb] = useState<string | null>(null)
  const colls = useAsync(
    () => (db ? window.api.mongo.listCollections(db) : Promise.resolve([])),
    [db]
  )
  const [coll, setColl] = useState<string | null>(null)
  const [filter, setFilter] = useState('{}')
  const [limit, setLimit] = useState(50)
  const [nonce, setNonce] = useState(0)
  const [ai, setAi] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiErr, setAiErr] = useState<string | null>(null)
  const docs = useAsync(
    () => (db && coll ? window.api.mongo.find(db, coll, filter, limit) : Promise.resolve([])),
    [db, coll, nonce]
  )

  useEffect(() => {
    if (!db && dbs.data?.length) {
      setDb(dbs.data.find((d) => !SYSTEM_DBS.includes(d.name))?.name ?? dbs.data[0].name)
    }
  }, [dbs.data, db])
  useEffect(() => setColl(null), [db])
  useEffect(() => {
    if (db && !coll && colls.data?.length) setColl(colls.data[0])
  }, [colls.data, coll, db])

  const askAi = async (): Promise<void> => {
    if (!ai.trim() || !db || !coll || aiLoading) return
    setAiLoading(true)
    setAiErr(null)
    try {
      const generated = await window.api.mongo.aiQuery(db, coll, ai.trim())
      setFilter(generated)
      setNonce((n) => n + 1)
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : String(e))
    } finally {
      setAiLoading(false)
    }
  }

  if (dbs.error?.includes('NO_MONGO_URI')) return <MissingUri />

  const rows = (docs.data ?? []) as unknown[]

  return (
    <div className="mongo-tab">
      <PanelGroup direction="horizontal" autoSaveId="mongo-h">
        <Panel defaultSize={22} minSize={14}>
          <div className="mongo-listcol">
            <div className="mongo-dbbar">
              <Dropdown
                value={db ?? ''}
                options={(dbs.data ?? []).map((d) => ({ value: d.name, label: d.name }))}
                onChange={setDb}
                searchable
                minWidth={200}
                placeholder={dbs.loading ? 'connecting…' : 'database'}
              />
            </div>
            <div className="mongo-colls">
              {dbs.error && !dbs.error.includes('NO_MONGO_URI') && (
                <div className="gh-state gh-error">{dbs.error}</div>
              )}
              {colls.loading && <div className="side-term-hint">Loading…</div>}
              {(colls.data ?? []).map((c) => (
                <button
                  key={c}
                  className={`mongo-coll${coll === c ? ' sel' : ''}`}
                  onClick={() => setColl(c)}
                  title={c}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel defaultSize={78} minSize={30}>
          <div className="mongo-view">
            <div className="mongo-ai">
              <input
                className="mongo-ai-input"
                placeholder={
                  coll ? `Ask AI to query "${coll}"…` : 'Select a collection, then ask AI…'
                }
                value={ai}
                disabled={!coll || aiLoading}
                onChange={(e) => setAi(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && askAi()}
              />
              <button className="tbtn" onClick={askAi} disabled={!coll || aiLoading || !ai.trim()}>
                {aiLoading ? 'Asking…' : 'Ask AI'}
              </button>
            </div>
            {aiErr && <div className="gh-state gh-error">{aiErr}</div>}
            <div className="mongo-querybar">
              <span className="mongo-coll-name">{coll ?? '—'}</span>
              <input
                className="mongo-filter"
                value={filter}
                spellCheck={false}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setNonce((n) => n + 1)}
                placeholder='filter, e.g. { "status": "active" }'
              />
              <input
                className="mongo-limit"
                type="number"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 50)}
                title="Limit"
              />
              <button className="tbtn" onClick={() => setNonce((n) => n + 1)}>
                Run
              </button>
            </div>
            <div className="mongo-results">
              {docs.loading && <div className="side-term-hint">Querying…</div>}
              {docs.error && <div className="gh-state gh-error">{docs.error}</div>}
              {!docs.loading && !docs.error && rows.length === 0 && (
                <div className="side-term-hint">No documents.</div>
              )}
              {rows.map((doc, i) => (
                <pre key={i} className="mongo-doc">
                  {JSON.stringify(doc, null, 2)}
                </pre>
              ))}
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
