import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { createInterface } from 'readline'
import type { SessionAgent, SessionRef, SessionTask } from '@shared/types'
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
  // TaskCreate's tool_use doesn't carry its assigned id — that comes back in the
  // tool_result ("Task #N created"). Correlate via tool_use_id so TaskUpdate(taskId)
  // matches the REAL id, not a fabricated 1..N (which silently breaks whenever the
  // task counter didn't start at 1, e.g. a continued session → 0/N completed).
  const byToolUse = new Map<string, MutableTask>()

  const rl = createInterface({
    input: createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })
  try {
    for await (const raw of rl) {
      const line = raw.trim()
      if (!line) continue
      // `/clear` wipes the conversation context in place (same session id/file),
      // so drop everything parsed before it — only the post-clear plan is current.
      if (line.includes('/clear</command-name>')) {
        tasks.length = 0
        byId.clear()
        byToolUse.clear()
        continue
      }
      let o: { message?: { content?: unknown } }
      try {
        o = JSON.parse(line)
      } catch {
        continue
      }
      const content = o.message?.content
      if (!Array.isArray(content)) continue
      for (const b of content as Array<Record<string, unknown>>) {
        if (!b) continue
        if (b.type === 'tool_use') {
          const input = (b.input ?? {}) as Record<string, unknown>
          if (b.name === 'TaskCreate') {
            const subject = input.subject != null ? String(input.subject).trim() : ''
            if (!subject) continue // skip empty / mid-stream creates (no "(task)")
            const t: MutableTask = {
              id: 0, // real id assigned when the matching tool_result is seen
              subject,
              description: input.description ? String(input.description) : undefined,
              status: 'pending'
            }
            tasks.push(t)
            if (typeof b.id === 'string') byToolUse.set(b.id, t)
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
            byToolUse.clear()
            ;(input.todos as Array<Record<string, unknown>>).forEach((td, i) => {
              const subject = String(td.content ?? td.activeForm ?? '').trim()
              if (!subject) return // skip empty todos (no "(todo)")
              const t: MutableTask = {
                id: i + 1,
                subject,
                status:
                  td.status === 'in_progress' || td.status === 'completed'
                    ? (td.status as SessionTask['status'])
                    : 'pending'
              }
              tasks.push(t)
              byId.set(t.id, t)
            })
          }
        } else if (b.type === 'tool_result') {
          // Bind the real task id from "Task #N created" back onto its create.
          const rc = b.content
          const txt = Array.isArray(rc)
            ? (rc as Array<Record<string, unknown>>).map((x) => String(x?.text ?? '')).join('')
            : String(rc ?? '')
          const m = txt.match(/Task #(\d+) created/)
          if (m && typeof b.tool_use_id === 'string') {
            const t = byToolUse.get(b.tool_use_id)
            if (t) {
              t.id = Number(m[1])
              byId.set(t.id, t)
            }
          }
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

  const repos = await discoverRepos()
  const owners = new Set(repos.map((r) => r.nameWithOwner?.split('/')[0]).filter(Boolean) as string[])
  // Resolve a cwd to its repo's owner/name (longest path wins), for `gh … view N`
  // commands that omit -R and rely on the working directory.
  const repoByPath = repos.filter((r) => r.nameWithOwner).sort((a, b) => b.path.length - a.path.length)
  const repoForCwd = (cwd: string): string | null => {
    for (const r of repoByPath) if (cwd === r.path || cwd.startsWith(r.path + '/')) return r.nameWithOwner!
    return null
  }
  const prs = new Map<string, SessionRef>()
  const issues = new Map<string, SessionRef>()

  let raw = ''
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return []
  }

  // `/clear` starts a fresh context in the same transcript — only link the
  // issues/PRs from the latest segment (after the last /clear), not the whole file.
  {
    const lines = raw.split('\n')
    let lastClear = -1
    for (let i = 0; i < lines.length; i++)
      if (lines[i].includes('/clear</command-name>')) lastClear = i
    if (lastClear >= 0) raw = lines.slice(lastClear + 1).join('\n')
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

  // `gh issue|pr view N` WITHOUT -R: resolve the repo from that line's cwd, so an
  // agent that ran `gh issue view 5095` inside a repo still links the issue.
  const GH_NOREPO_RE = /gh\s+(issue|pr)\s+view\s+(\d+)/g
  for (const line of raw.split('\n')) {
    if (!line.includes('gh ') || !line.includes('view')) continue
    let o: { cwd?: string }
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    if (!o.cwd) continue
    const nwo = repoForCwd(o.cwd)
    if (!nwo) continue
    GH_NOREPO_RE.lastIndex = 0
    let gm: RegExpExecArray | null
    while ((gm = GH_NOREPO_RE.exec(line))) {
      if (/^\s*(?:-R|--repo)\b/.test(line.slice(gm.index + gm[0].length))) continue // -R form handled above
      const isPr = gm[1] === 'pr'
      const url = `https://github.com/${nwo}/${isPr ? 'pull' : 'issues'}/${gm[2]}`
      const bucket = isPr ? prs : issues
      if (!bucket.has(url))
        bucket.set(url, { kind: isPr ? 'pr' : 'issue', repo: nwo, number: Number(gm[2]), url })
    }
  }

  // Anchor the "primary" ref: the issue/PR named in the FIRST real user message
  // (the launch prompt, e.g. "Investigate issue #5067 …"). A planning session may
  // reference many sub-issues; this marks the one it's actually about.
  const ut = firstUserText(raw)
  if (ut) {
    let primaryUrl: string | null = null
    URL_RE.lastIndex = 0
    let um: RegExpExecArray | null
    while ((um = URL_RE.exec(ut))) {
      const [, owner, repo, kind, num] = um
      if (!owners.has(owner)) continue
      const isPr = kind === 'pull'
      const url = `https://github.com/${owner}/${repo}/${isPr ? 'pull' : 'issues'}/${num}`
      if (!isPr) {
        primaryUrl = url // prefer the first issue
        break
      }
      if (!primaryUrl) primaryUrl = url
    }
    if (!primaryUrl) {
      GH_CMD_RE.lastIndex = 0
      const gm = GH_CMD_RE.exec(ut)
      if (gm && owners.has(gm[3])) {
        const isPr = gm[1] === 'pr'
        primaryUrl = `https://github.com/${gm[3]}/${gm[4]}/${isPr ? 'pull' : 'issues'}/${gm[2]}`
      }
    }
    if (primaryUrl) {
      const ref = issues.get(primaryUrl) ?? prs.get(primaryUrl)
      if (ref) ref.primary = true
    }
  }

  const refs = [...prs.values(), ...issues.values()]
  linkCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, refs })
  return refs
}

// Text of the first real user message (the launch prompt) — skips tool_result-only
// user turns, which carry no text.
function firstUserText(raw: string): string {
  for (const line of raw.split('\n')) {
    if (!line.includes('"role":"user"') && !line.includes('"type":"user"')) continue
    try {
      const o = JSON.parse(line) as { type?: string; message?: { role?: string; content?: unknown } }
      if (o.type !== 'user' && o.message?.role !== 'user') continue
      const c = o.message?.content
      if (typeof c === 'string') return c
      if (Array.isArray(c)) {
        const txt = (c as Array<Record<string, unknown>>)
          .map((b) => (b && typeof b.text === 'string' ? b.text : ''))
          .join(' ')
        if (txt.trim()) return txt
      }
    } catch {
      /* ignore */
    }
  }
  return ''
}

/** Flatten a tool_result's content (string, or blocks) to plain text. */
function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content))
    return content
      .map((b) => (typeof b === 'string' ? b : ((b as { text?: string })?.text ?? '')))
      .join('\n')
  return ''
}

// Subagents a session spawned, reconstructed from its `Agent` tool calls. An
// invocation without a matching tool_result is still running — that pairing is
// what makes "running vs done" knowable without any extra instrumentation.
export async function getSessionAgents(sessionId: string): Promise<SessionAgent[]> {
  const file = findSessionFile(sessionId)
  if (!file) return []
  const agents = new Map<string, SessionAgent>()
  const rl = createInterface({
    input: createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })
  try {
    for await (const raw of rl) {
      if (!raw.includes('subagent_type') && !raw.includes('tool_result')) continue
      let o: unknown
      try {
        o = JSON.parse(raw)
      } catch {
        continue
      }
      const content = (o as { message?: { content?: unknown } })?.message?.content
      if (!Array.isArray(content)) continue
      for (const b of content as Record<string, unknown>[]) {
        const input = b?.input as Record<string, unknown> | undefined
        if (b?.type === 'tool_use' && b?.name === 'Agent' && input?.subagent_type) {
          agents.set(String(b.id), {
            id: String(b.id),
            type: String(input.subagent_type),
            description: String(input.description ?? '').slice(0, 140),
            status: 'running'
          })
        } else if (b?.type === 'tool_result') {
          const a = agents.get(String(b.tool_use_id))
          if (a) {
            a.status = 'done'
            a.result = resultText(b.content).slice(0, 6000)
          }
        }
      }
    }
  } finally {
    rl.close()
  }
  return [...agents.values()].reverse() // newest first
}
