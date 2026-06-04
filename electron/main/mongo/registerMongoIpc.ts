import { EJSON } from 'bson'
import { MongoClient } from 'mongodb'
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { MongoDatabase } from '@shared/types'
import { getSettings } from '../settings/SettingsStore'

export const NO_MONGO_URI = 'NO_MONGO_URI'

let client: MongoClient | null = null
let clientUri = ''

async function getClient(): Promise<MongoClient> {
  const uri = getSettings().mongoUri || process.env.MONGODB_URI || ''
  if (!uri) throw new Error(NO_MONGO_URI)
  if (client && clientUri === uri) return client
  if (client) await client.close().catch(() => {})
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 })
  await client.connect()
  clientUri = uri
  return client
}

/** Convert BSON docs to plain JSON-safe objects (relaxed extended JSON). */
function toPlain(docs: unknown[]): unknown[] {
  return JSON.parse(EJSON.stringify(docs, { relaxed: true }) as string)
}

async function listDatabases(): Promise<MongoDatabase[]> {
  const c = await getClient()
  const { databases } = await c.db().admin().listDatabases()
  return databases.map((d) => ({ name: d.name, sizeOnDisk: d.sizeOnDisk }))
}

async function listCollections(db: string): Promise<string[]> {
  const c = await getClient()
  const colls = await c.db(db).listCollections().toArray()
  return colls.map((x) => x.name).sort()
}

async function find(
  db: string,
  coll: string,
  filterJson: string,
  limit: number
): Promise<unknown[]> {
  const c = await getClient()
  let filter: Record<string, unknown> = {}
  if (filterJson && filterJson.trim()) {
    try {
      filter = EJSON.parse(filterJson) as Record<string, unknown>
    } catch {
      throw new Error('Invalid filter JSON')
    }
  }
  const docs = await c
    .db(db)
    .collection(coll)
    .find(filter)
    .limit(Math.min(limit || 50, 200))
    .toArray()
  return toPlain(docs)
}

export function registerMongoIpc(): void {
  ipcMain.handle(IPC.mongo.listDatabases, () => listDatabases())
  ipcMain.handle(IPC.mongo.listCollections, (_e, db: string) => listCollections(db))
  ipcMain.handle(IPC.mongo.find, (_e, db: string, coll: string, filter: string, limit: number) =>
    find(db, coll, filter, limit)
  )
}
