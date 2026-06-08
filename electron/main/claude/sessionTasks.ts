import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { createInterface } from 'readline'
import type { SessionRef, SessionTask } from '@shared/types'
import { discoverRepos } from '../git/WorktreeService'

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
            description: input.description ? String(input.description) : undefined,
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

  const result = tasks
    .filter((t) => !t.deleted)
    .map((t) => ({ id: t.id, subject: t.subject, description: t.description, status: t.status }))
  cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, tasks: result })
  return result
}

// The latest plan markdown a session produced (from ExitPlanMode tool calls).
const planCache = new Map<string, { mtimeMs: number; size: number; plan: string }>()

export async function getSessionPlan(sessionId: string): Promise<string> {
  const file = findSessionFile(sessionId)
  if (!file) return ''
  let st
  try {
    st = statSync(file)
  } catch {
    return ''
  }
  const cached = planCache.get(file)
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) return cached.plan

  let plan = ''
  let writtenPlan = '' // fallback: plan saved to a ~/.claude/plans/*.md via Write
  const rl = createInterface({
    input: createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })
  try {
    for await (const raw of rl) {
      const line = raw.trim()
      if (!line || (!line.includes('ExitPlanMode') && !line.includes('"Write"'))) continue
      let o: { message?: { content?: unknown } }
      try {
        o = JSON.parse(line)
      } catch {
        continue
      }
      const content = o.message?.content
      if (!Array.isArray(content)) continue
      for (const b of content as Array<Record<string, unknown>>) {
        if (b?.type === 'tool_use' && b.name === 'ExitPlanMode') {
          const p = (b.input as { plan?: string })?.plan
          if (p) plan = p // keep the latest
        } else if (b?.type === 'tool_use' && b.name === 'Write') {
          // Some plan-mode sessions Write the plan to ~/.claude/plans/<name>.md
          // instead of calling ExitPlanMode.
          const inp = b.input as { file_path?: string; content?: string }
          if (inp?.file_path && inp.content && /\/plans\/[^/]+\.md$/.test(inp.file_path)) {
            writtenPlan = inp.content // keep the latest plan-file write
          }
        }
      }
    }
  } finally {
    rl.close()
  }
  const result = plan || writtenPlan
  planCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, plan: result })
  return result
}

// Extract the PRs/issues a session worked on from its transcript: authoritative
// `pr-link` entries, github URLs, and `gh issue|pr view N -R owner/repo` commands
// (how the Investigate flow references the issue) — filtered to workspace owners.
const URL_RE = /github\.com\/([\w.-]+)\/([\w.-]+)\/(pull|issues)\/(\d+)/g
const GH_CMD_RE = /gh\s+(issue|pr)\s+view\s+(\d+)\s+(?:-R|--repo)\s+([\w.-]+)\/([\w.-]+)/g
const linkCache = new Map<string, { mtimeMs: number; size: number; refs: SessionRef[] }>()

export async function getSessionLinks(sessionId: string): Promise<SessionRef[]> {
  const file = findSessionFile(sessionId)
  if (!file) return []
  let st
  try {
    st = statSync(file)
  } catch {
    return []
  }
  const cached = linkCache.get(file)
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) return cached.refs

  const owners = new Set(
    (await discoverRepos()).map((r) => r.nameWithOwner?.split('/')[0]).filter(Boolean) as string[]
  )
  const prs = new Map<string, SessionRef>()
  const issues = new Map<string, SessionRef>()

  let raw = ''
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return []
  }

  // Authoritative PRs from pr-link entries.
  for (const line of raw.split('\n')) {
    if (!line.includes('"pr-link"')) continue
    try {
      const o = JSON.parse(line) as { type?: string; prNumber?: number; prUrl?: string; prRepository?: string }
      if (o.type === 'pr-link' && o.prUrl && o.prRepository && o.prNumber) {
        prs.set(o.prUrl, { kind: 'pr', repo: o.prRepository, number: o.prNumber, url: o.prUrl })
      }
    } catch {
      /* ignore */
    }
  }

  // URLs in text (PRs + issues), filtered to workspace owners.
  let m: RegExpExecArray | null
  URL_RE.lastIndex = 0
  while ((m = URL_RE.exec(raw))) {
    const [, owner, repo, kind, num] = m
    if (!owners.has(owner)) continue
    const isPr = kind === 'pull'
    const url = `https://github.com/${owner}/${repo}/${isPr ? 'pull' : 'issues'}/${num}`
    const ref: SessionRef = { kind: isPr ? 'pr' : 'issue', repo: `${owner}/${repo}`, number: Number(num), url }
    ;(isPr ? prs : issues).set(url, ref)
  }

  // `gh issue|pr view N -R owner/repo` commands (the Investigate flow's reference).
  GH_CMD_RE.lastIndex = 0
  while ((m = GH_CMD_RE.exec(raw))) {
    const [, kind, num, owner, repo] = m
    if (!owners.has(owner)) continue
    const isPr = kind === 'pr'
    const url = `https://github.com/${owner}/${repo}/${isPr ? 'pull' : 'issues'}/${num}`
    const ref: SessionRef = { kind: isPr ? 'pr' : 'issue', repo: `${owner}/${repo}`, number: Number(num), url }
    const bucket = isPr ? prs : issues
    if (!bucket.has(url)) bucket.set(url, ref)
  }

  const refs = [...prs.values(), ...issues.values()]
  linkCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, refs })
  return refs
}
