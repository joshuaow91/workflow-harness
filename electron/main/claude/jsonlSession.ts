import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { createInterface } from 'readline'
import { basename } from 'path'

export interface SessionMeta {
  sessionId: string
  title: string
  cwd: string | null
  gitBranch: string | null
  startedAt: string | null
  lastActivityAt: string | null
  messageCount: number
}

type JsonLine = {
  type?: string
  isMeta?: boolean
  isSidechain?: boolean
  timestamp?: string
  cwd?: string
  gitBranch?: string
  aiTitle?: string
  message?: { content?: unknown }
}

function extractText(content: unknown): string | null {
  if (typeof content === 'string') return content.trim() || null
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === 'object' && (block as { type?: string }).type === 'text') {
        const text = (block as { text?: string }).text
        if (typeof text === 'string' && text.trim()) return text.trim()
      }
    }
  }
  return null
}

function isToolResult(content: unknown): boolean {
  return (
    Array.isArray(content) &&
    content.some(
      (b) => b && typeof b === 'object' && (b as { type?: string }).type === 'tool_result'
    )
  )
}

// Simple in-process cache so repeated reads of unchanged files are free.
// Invalidated by mtime+size; the file watcher drives re-parses on change.
const cache = new Map<string, { mtimeMs: number; size: number; meta: SessionMeta }>()

export async function parseSessionFile(filePath: string): Promise<SessionMeta | null> {
  let st
  try {
    st = await stat(filePath)
  } catch {
    return null
  }

  const cached = cache.get(filePath)
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
    return cached.meta
  }

  const sessionId = basename(filePath, '.jsonl')
  let cwd: string | null = null
  let gitBranch: string | null = null
  let startedAt: string | null = null
  let lastActivityAt: string | null = null
  let aiTitle: string | null = null // last ai-title wins (titles evolve)
  let firstPrompt: string | null = null
  let messageCount = 0

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })

  try {
    for await (const raw of rl) {
      const line = raw.trim()
      if (!line) continue
      let o: JsonLine
      try {
        o = JSON.parse(line)
      } catch {
        continue
      }

      if (o.timestamp) lastActivityAt = o.timestamp

      if (o.type === 'ai-title' && o.aiTitle) {
        aiTitle = o.aiTitle
        continue
      }

      if (o.type === 'user' || o.type === 'assistant') {
        if (!o.isSidechain) messageCount++
        if (o.type === 'user' && !o.isMeta && !o.isSidechain) {
          if (cwd === null && o.cwd) cwd = o.cwd
          if (gitBranch === null && o.gitBranch) gitBranch = o.gitBranch
          if (startedAt === null && o.timestamp) startedAt = o.timestamp
          if (firstPrompt === null) {
            const content = o.message?.content
            if (!isToolResult(content)) {
              const text = extractText(content)
              if (text) firstPrompt = text
            }
          }
        }
      }
    }
  } finally {
    rl.close()
  }

  const titleSource = aiTitle ?? firstPrompt ?? sessionId
  const title = titleSource.length > 90 ? titleSource.slice(0, 90).trimEnd() + '…' : titleSource

  const meta: SessionMeta = {
    sessionId,
    title,
    cwd,
    gitBranch,
    startedAt,
    lastActivityAt,
    messageCount
  }

  cache.set(filePath, { mtimeMs: st.mtimeMs, size: st.size, meta })
  return meta
}
