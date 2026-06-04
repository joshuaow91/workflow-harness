import { useEffect, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useAsync } from '../lib/useAsync'
import { Dropdown } from '../components/Dropdown'

const SYSTEM_DBS = ['admin', 'local', 'config']
type Op = 'find' | 'aggregate'

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
  const colls = useAsync(() => (db ? window.api.mongo.listCollections(db) : Promise.resolve([])), [db])
  const [coll, setColl] = useState<string | null>(null)
  const [op, setOp] = useState<Op>('find')
  const [queryText, setQueryText] = useState('{}')
  const [limit, setLimit] = useState(50)
  const [nonce, setNonce] = useState(0)

  const [ai, setAi] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiErr, setAiErr] = useState<string | null>(null)

  const docs = useAsync(
    () =>
      db && coll ? window.api.mongo.run(db, coll, op, queryText, limit) : Promise.resolve([]),
    [db, coll, nonce]
  )

  useEffect(() => {
    if (!db && dbs.data?.length) {
      const nonSystem = dbs.data.filter((d) => !SYSTEM_DBS.includes(d.name))
      const preferred =
        nonSystem.find((d) => /workflow/i.test(d.name)) ?? nonSystem[0] ?? dbs.data[0]
      setDb(preferred.name)
    }
  }, [dbs.data, db])
  useEffect(() => {
    setColl(null)
  }, [db])
  useEffect(() => {
    if (db && !coll && colls.data?.length) {
      setColl(colls.data[0])
      setOp('find')
      setQueryText('{}')
    }
  }, [colls.data, coll, db])

  const selectColl = (c: string): void => {
    setColl(c)
    setOp('find')
    setQueryText('{}')
  }

  const askAi = async (): Promise<void> => {
    if (!ai.trim() || !db || aiLoading) return
    setAiLoading(true)
    setAiErr(null)
    try {
      const raw = await window.api.mongo.aiQuery(db, ai.trim())
      const spec = JSON.parse(raw) as { collection: string; operation: Op; query: unknown; limit?: number }
      setColl(spec.collection)
      setOp(spec.operation === 'aggregate' ? 'aggregate' : 'find')
      setQueryText(JSON.stringify(spec.query ?? (spec.operation === 'aggregate' ? [] : {}), null, 2))
      if (spec.limit) setLimit(spec.limit)
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
        <Panel defaultSize={20} minSize={13}>
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
                  onClick={() => selectColl(c)}
                  title={c}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel defaultSize={80} minSize={30}>
          <div className="mongo-view">
            <div className="mongo-ai">
              <textarea
                className="mongo-ai-input"
                rows={2}
                placeholder="Describe what you want — AI picks the collection and writes the find/aggregate query. (⌘↵ to run)"
                value={ai}
                disabled={!db || aiLoading}
                onChange={(e) => setAi(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    void askAi()
                  }
                }}
              />
              <button className="tbtn" onClick={askAi} disabled={!db || aiLoading || !ai.trim()}>
                {aiLoading ? 'Asking…' : 'Ask AI'}
              </button>
            </div>
            {aiErr && <div className="gh-state gh-error">{aiErr}</div>}

            <div className="mongo-querybar">
              <div className="mongo-ops">
                <button
                  className={`mongo-op${op === 'find' ? ' active' : ''}`}
                  onClick={() => setOp('find')}
                >
                  find
                </button>
                <button
                  className={`mongo-op${op === 'aggregate' ? ' active' : ''}`}
                  onClick={() => setOp('aggregate')}
                >
                  aggregate
                </button>
              </div>
              <span className="mongo-coll-name">{coll ?? '—'}</span>
              <input
                className="mongo-limit"
                type="number"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 50)}
                title="Limit"
              />
              <button className="tbtn" onClick={() => setNonce((n) => n + 1)} disabled={!coll}>
                Run
              </button>
            </div>
            <textarea
              className="mongo-query"
              value={queryText}
              spellCheck={false}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder={op === 'aggregate' ? '[ { "$match": { } } ]' : '{ "field": "value" }'}
            />

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
