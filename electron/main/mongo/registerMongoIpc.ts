import { activeProvider } from '../agents/registry'
import { EJSON } from 'bson'
import { MongoClient } from 'mongodb'
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { MongoDatabase } from '@shared/types'
import { getSettings } from '../settings/SettingsStore'

export const NO_MONGO_URI = 'NO_MONGO_URI'

// Resolve a connection name to its URI. Prefers the named connection, then the
// first configured one, then the legacy single mongoUri, then the env var — so
// older single-URI setups keep working without migration.
function resolveUri(connName?: string): string {
  const s = getSettings()
  const conns = s.mongoConnections ?? []
  if (connName) {
    const match = conns.find((c) => c.name === connName)
    if (match?.uri) return match.uri
  }
  return conns[0]?.uri || s.mongoUri || process.env.MONGODB_URI || ''
}

// One cached client per distinct URI, so switching between (and back to) Prod
// and Local is instant and both stay connected.
const clients = new Map<string, MongoClient>()

async function getClient(connName?: string): Promise<MongoClient> {
  const uri = resolveUri(connName)
  if (!uri) throw new Error(NO_MONGO_URI)
  const cached = clients.get(uri)
  if (cached) return cached
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 })
  await client.connect() // failure propagates and nothing is cached
  clients.set(uri, client)
  return client
}

/** Convert BSON docs to plain JSON-safe objects (relaxed extended JSON). */
function toPlain(docs: unknown[]): unknown[] {
  return JSON.parse(EJSON.stringify(docs, { relaxed: true }) as string)
}

async function listDatabases(conn?: string): Promise<MongoDatabase[]> {
  const c = await getClient(conn)
  const { databases } = await c.db().admin().listDatabases()
  return databases.map((d) => ({ name: d.name, sizeOnDisk: d.sizeOnDisk }))
}

async function listCollections(conn: string | undefined, db: string): Promise<string[]> {
  const c = await getClient(conn)
  const colls = await c.db(db).listCollections().toArray()
  return colls.map((x) => x.name).sort()
}

const WRITE_STAGES = ['$out', '$merge']

// Run a read-only find or aggregate. queryJson is a filter object (find) or a
// pipeline array (aggregate), in extended JSON.
async function run(
  conn: string | undefined,
  db: string,
  coll: string,
  operation: 'find' | 'aggregate',
  queryJson: string,
  limit: number
): Promise<unknown[]> {
  const c = await getClient(conn)
  const col = c.db(db).collection(coll)
  const cap = Math.min(limit || 50, 500)

  let parsed: unknown = operation === 'aggregate' ? [] : {}
  if (queryJson && queryJson.trim()) {
    try {
      parsed = EJSON.parse(queryJson)
    } catch {
      throw new Error('Invalid query JSON')
    }
  }

  if (operation === 'aggregate') {
    const pipeline = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : []
    for (const stage of pipeline) {
      if (Object.keys(stage ?? {}).some((k) => WRITE_STAGES.includes(k))) {
        throw new Error('Write stages ($out/$merge) are not allowed — this browser is read-only.')
      }
    }
    const capped = pipeline.some((s) => '$limit' in (s ?? {}))
      ? pipeline
      : [...pipeline, { $limit: cap }]
    const docs = await col.aggregate(capped, { maxTimeMS: 20000 }).toArray()
    return toPlain(docs)
  }

  const filter = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  const docs = await col.find(filter as Record<string, unknown>).limit(cap).toArray()
  return toPlain(docs)
}

// Natural language -> a full query spec. Gives Claude every collection in the db
// plus a sample document of each, and lets it pick the collection and build a
// find filter or an aggregation pipeline.
async function aiQuery(conn: string | undefined, db: string, prompt: string): Promise<string> {
  const c = await getClient(conn)
  const names = (await c.db(db).listCollections().toArray()).map((x) => x.name).sort()

  const samples: Record<string, unknown> = {}
  await Promise.all(
    names.slice(0, 40).map(async (name) => {
      try {
        const doc = await c.db(db).collection(name).findOne({})
        if (doc) samples[name] = JSON.parse((EJSON.stringify(doc, { relaxed: true }) as string).slice(0, 400))
      } catch {
        /* skip */
      }
    })
  )

  const schema = JSON.stringify(samples).slice(0, 8000)
  const full =
    `You are a MongoDB query generator for database "${db}". ` +
    `Here are its collections, each with a sample document showing the schema:\n${schema}\n\n` +
    `For the user's request, pick the right collection and build a query. Respond with ONLY a JSON ` +
    `object (no prose, no code fences) of this exact shape:\n` +
    `{"collection":"<name>","operation":"find"|"aggregate","query":<filter object OR aggregation pipeline array>,"limit":<number>}\n` +
    `Use "aggregate" with a pipeline array for grouping/counting/joining/sorting-by-computed; use "find" ` +
    `with a filter object for simple lookups. Never use $out or $merge. Use extended JSON for dates: {"$date":"ISO"}.\n\n` +
    `Request: ${prompt}`

  const out = await activeProvider().oneShot(full)
  return out
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
}

export function registerMongoIpc(): void {
  ipcMain.handle(IPC.mongo.listDatabases, (_e, conn?: string) => listDatabases(conn))
  ipcMain.handle(IPC.mongo.listCollections, (_e, conn: string | undefined, db: string) =>
    listCollections(conn, db)
  )
  ipcMain.handle(
    IPC.mongo.run,
    (
      _e,
      conn: string | undefined,
      db: string,
      coll: string,
      operation: 'find' | 'aggregate',
      query: string,
      limit: number
    ) => run(conn, db, coll, operation, query, limit)
  )
  ipcMain.handle(IPC.mongo.aiQuery, (_e, conn: string | undefined, db: string, prompt: string) =>
    aiQuery(conn, db, prompt)
  )
}
