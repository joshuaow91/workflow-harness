import { createReadStream, existsSync, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { createInterface } from 'readline'
import type { SessionTask } from '@shared/types'

const PROJECTS = join(homedir(), '.claude', 'projects')

function findSessionFile(sessionId: string): string | null {
  try {
    for (const slug of readdirSync(PROJECTS)) {
      const f = join(PROJECTS, slug, `${sessionId}.jsonl`)
      if (existsSync(f)) return f
    }
  } catch {
    /* ignore */
  }
  return null
}

interface MutableTask extends SessionTask {
  deleted?: boolean
}

const cache = new Map<string, { mtimeMs: number; size: number; tasks: SessionTask[] }>()

// Reconstruct the current task list from a session transcript by replaying its
// TaskCreate/TaskUpdate (and TodoWrite, as a fallback) tool calls.
export async function getSessionTasks(sessionId: string): Promise<SessionTask[]> {
  const file = findSessionFile(sessionId)
  if (!file) return []
  let st
  try {
    st = statSync(file)
  } catch {
    return []
  }
  const cached = cache.get(file)
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) return cached.tasks

  const tasks: MutableTask[] = []
  const byId = new Map<number, MutableTask>()

  const rl = createInterface({
    input: createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })
  try {
    for await (const raw of rl) {
      const line = raw.trim()
      if (!line) continue
      let o: { message?: { content?: unknown } }
      try {
        o = JSON.parse(line)
      } catch {
        continue
      }
      const content = o.message?.content
      if (!Array.isArray(content)) continue
      for (const b of content as Array<Record<string, unknown>>) {
        if (!b || b.type !== 'tool_use') continue
        const input = (b.input ?? {}) as Record<string, unknown>
        if (b.name === 'TaskCreate') {
          const t: MutableTask = {
            id: tasks.length + 1,
            subject: String(input.subject ?? '(task)'),
            status: 'pending'
          }
          tasks.push(t)
          byId.set(t.id, t)
        } else if (b.name === 'TaskUpdate') {
          const t = byId.get(Number(input.taskId))
          const status = input.status as string | undefined
          if (t && status) {
            if (status === 'deleted') t.deleted = true
            else if (status === 'pending' || status === 'in_progress' || status === 'completed')
              t.status = status
          }
        } else if (b.name === 'TodoWrite' && Array.isArray(input.todos)) {
          tasks.length = 0
          byId.clear()
          ;(input.todos as Array<Record<string, unknown>>).forEach((td, i) => {
            const t: MutableTask = {
              id: i + 1,
              subject: String(td.content ?? td.activeForm ?? '(todo)'),
              status:
                td.status === 'in_progress' || td.status === 'completed'
                  ? (td.status as SessionTask['status'])
                  : 'pending'
            }
            tasks.push(t)
            byId.set(t.id, t)
          })
        }
      }
    }
  } finally {
    rl.close()
  }

  const result = tasks.filter((t) => !t.deleted).map((t) => ({ id: t.id, subject: t.subject, status: t.status }))
  cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, tasks: result })
  return result
}
