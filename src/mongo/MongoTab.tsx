import { useEffect, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useAsync } from '../lib/useAsync'
import { Dropdown } from '../components/Dropdown'

const SYSTEM_DBS = ['admin', 'local', 'config']
type Op = 'find' | 'aggregate'

// ---- Compass-style document rendering (relaxed EJSON from main) ----

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const isOid = (v: unknown): v is { $oid: string } =>
  isObj(v) && typeof v.$oid === 'string' && Object.keys(v).length === 1
const isDate = (v: unknown): v is { $date: unknown } =>
  isObj(v) && '$date' in v && Object.keys(v).length === 1
const isLong = (v: unknown): v is { $numberLong: string } => isObj(v) && typeof v.$numberLong === 'string'
const isDecimal = (v: unknown): v is { $numberDecimal: string } =>
  isObj(v) && typeof v.$numberDecimal === 'string'
const isLeaf = (v: unknown): boolean =>
  v === null || typeof v !== 'object' || isOid(v) || isDate(v) || isLong(v) || isDecimal(v)

function dateStr(d: unknown): string {
  if (typeof d === 'string') return d.replace('T', ' ').replace(/\.\d+Z$/, '')
  if (isObj(d) && typeof d.$numberLong === 'string')
    return new Date(Number(d.$numberLong)).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')
  return String(d)
}

function Scalar({ value }: { value: unknown }) {
  if (value === null) return <span className="mv-null">null</span>
  if (isOid(value)) return <span className="mv-oid">ObjectId(&apos;{value.$oid}&apos;)</span>
  if (isDate(value)) return <span className="mv-date">{dateStr(value.$date)}</span>
  if (isLong(value)) return <span className="mv-num">{value.$numberLong}</span>
  if (isDecimal(value)) return <span className="mv-num">{value.$numberDecimal}</span>
  if (typeof value === 'string') return <span className="mv-str">&quot;{value}&quot;</span>
  if (typeof value === 'number') return <span className="mv-num">{value}</span>
  if (typeof value === 'boolean') return <span className="mv-bool">{String(value)}</span>
  return <span className="mv-str">{String(value)}</span>
}

function Node({ k, value, depth }: { k: string | number; value: unknown; depth: number }) {
  const [open, setOpen] = useState(false)
  if (isLeaf(value)) {
    return (
      <div className="mongo-field" style={{ paddingLeft: 10 + depth * 14 }}>
        <span className="mk">{k}</span>
        <span className="mc">:</span> <Scalar value={value} />
      </div>
    )
  }
  const arr = Array.isArray(value)
  const entries: [string | number, unknown][] = arr
    ? (value as unknown[]).map((v, i) => [i, v])
    : Object.entries(value as Obj)
  const typeLabel = arr ? `Array (${entries.length})` : `Object (${entries.length})`
  return (
    <>
      <div
        className="mongo-field expandable"
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="mtri">{open ? '▾' : '▸'}</span>
        <span className="mk">{k}</span>
        <span className="mc">:</span> <span className="mtype">{typeLabel}</span>
      </div>
      {open && entries.map(([ck, cv]) => <Node key={String(ck)} k={ck} value={cv} depth={depth + 1} />)}
    </>
  )
}

function MongoDoc({ doc, index }: { doc: unknown; index: number }) {
  const entries = isObj(doc) ? Object.entries(doc) : []
  return (
    <div className="mongo-doc-card">
      <span className="mongo-doc-idx">{index + 1}</span>
      <div className="mongo-doc-body">
        {entries.map(([k, v]) => (
          <Node key={k} k={k} value={v} depth={0} />
        ))}
      </div>
    </div>
  )
}

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
  const [collFilter, setCollFilter] = useState('')

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
            <input
              className="mongo-coll-filter"
              placeholder="Filter collections…"
              value={collFilter}
              onChange={(e) => setCollFilter(e.target.value)}
            />
            <div className="mongo-colls">
              {dbs.error && !dbs.error.includes('NO_MONGO_URI') && (
                <div className="gh-state gh-error">{dbs.error}</div>
              )}
              {colls.loading && <div className="side-term-hint">Loading…</div>}
              {(colls.data ?? [])
                .filter((c) => !collFilter || c.toLowerCase().includes(collFilter.toLowerCase()))
                .map((c) => (
                  <button
                    key={c}
                    className={`mongo-coll${coll === c ? ' sel' : ''}`}
                    onClick={() => selectColl(c)}
                    title={c}
                  >
                    <span className="mongo-coll-ico">▤</span>
                    {c}
                  </button>
                ))}
            </div>
          </div>
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel defaultSize={80} minSize={30}>
          <div className="mongo-view">
            <div className="mongo-crumbs">
              <span className="mongo-crumb db">{db ?? '—'}</span>
              <span className="mongo-crumb-sep">›</span>
              <span className="mongo-crumb coll">{coll ?? '—'}</span>
              {!docs.loading && !docs.error && (
                <span className="mongo-crumb-count">
                  {rows.length}
                  {rows.length >= limit ? '+' : ''} document{rows.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
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
                <MongoDoc key={i} doc={doc} index={i} />
              ))}
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
