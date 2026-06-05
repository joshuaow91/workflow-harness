import { execFile } from 'child_process'
import { existsSync, readFileSync, statSync } from 'fs'
import { readdir, readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import type { ClaudeProject, ClaudeSession, SessionRef } from '@shared/types'
import { discoverRepos } from '../git/WorktreeService'
import type { AgentProvider } from './types'

const pexec = promisify(execFile)
const DIR = join(homedir(), '.codex')
const SESSIONS = join(DIR, 'sessions')
const CONFIG = join(DIR, 'config.toml')

// NOTE: built to Codex's documented rollout format; validate against a real
// ~/.codex/sessions/**/rollout-*.jsonl once a teammate actually uses Codex.

async function listRollouts(): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 5) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) await walk(full, depth + 1)
      else if (e.name.startsWith('rollout-') && e.name.endsWith('.jsonl')) out.push(full)
    }
  }
  await walk(SESSIONS, 0)
  return out
}

interface CodexMeta {
  sessionId: string
  cwd: string
  title: string
  startedAt: string | null
  lastActivityAt: string | null
}

function firstText(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) {
    for (const part of v) {
      const t = (part as { text?: string })?.text
      if (typeof t === 'string' && t.trim()) return t
    }
  }
  return null
}

function parseRollout(file: string): CodexMeta | null {
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const lines = raw.split('\n').filter(Boolean)
  if (!lines.length) return null
  let sessionId = ''
  let cwd = ''
  let startedAt: string | null = null
  let title = ''
  for (const line of lines.slice(0, 200)) {
    let o: Record<string, unknown>
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    const payload = (o.payload as Record<string, unknown>) ?? o
    if (!sessionId && typeof (payload.id ?? o.id) === 'string') sessionId = String(payload.id ?? o.id)
    if (!cwd && typeof payload.cwd === 'string') cwd = payload.cwd as string
    if (!startedAt && typeof (o.timestamp ?? payload.timestamp) === 'string')
      startedAt = String(o.timestamp ?? payload.timestamp)
    if (!title) {
      const role = payload.role ?? o.role
      if (role === 'user') {
        const t = firstText(payload.content ?? o.content)
        if (t) title = t.split('\n')[0].slice(0, 80)
      }
    }
  }
  if (!sessionId) {
    const m = file.match(/rollout-.*-([0-9a-f-]{36})\.jsonl$/i)
    sessionId = m ? m[1] : file
  }
  let mtime = 0
  try {
    mtime = statSync(file).mtimeMs
  } catch {
    /* ignore */
  }
  return {
    sessionId,
    cwd,
    title: title || '(codex session)',
    startedAt,
    lastActivityAt: mtime ? new Date(mtime).toISOString() : startedAt
  }
}

function findRolloutSync(sessionId: string): string | null {
  // synchronous best-effort lookup by id in filename or content
  const stack = [SESSIONS]
  while (stack.length) {
    const dir = stack.pop()!
    let entries
    try {
      entries = require('fs').readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) stack.push(full)
      else if (e.name.includes(sessionId)) return full
    }
  }
  return null
}

export const codexProvider: AgentProvider = {
  id: 'codex',
  label: 'Codex',
  cli: 'codex',
  watchPaths: () => [SESSIONS],

  async isInstalled() {
    try {
      const { stdout } = await pexec('codex', ['--version'])
      return { ok: true, version: stdout.split('\n')[0].trim() }
    } catch {
      return { ok: false, version: '' }
    }
  },

  async getProjects() {
    const files = await listRollouts()
    const metas = files.map(parseRollout).filter((m): m is CodexMeta => m !== null)
    const byCwd = new Map<string, ClaudeSession[]>()
    for (const m of metas) {
      const cwd = m.cwd || '(unknown)'
      const list = byCwd.get(cwd) ?? []
      list.push({
        sessionId: m.sessionId,
        title: m.title,
        cwd,
        gitBranch: null,
        startedAt: m.startedAt,
        lastActivityAt: m.lastActivityAt,
        live: null,
        messageCount: 0
      })
      byCwd.set(cwd, list)
    }
    const projects: ClaudeProject[] = []
    for (const [path, sessions] of byCwd) {
      sessions.sort((a, b) => Date.parse(b.lastActivityAt ?? '') - Date.parse(a.lastActivityAt ?? ''))
      projects.push({ slug: path, path, name: path.split('/').filter(Boolean).pop() ?? path, sessions })
    }
    projects.sort(
      (a, b) =>
        Date.parse(b.sessions[0]?.lastActivityAt ?? '') - Date.parse(a.sessions[0]?.lastActivityAt ?? '')
    )
    return projects
  },

  async deleteSession() {
    /* codex transcript deletion not wired yet */
  },

  async sessionTasks() {
    return [] // Codex plan/todo extraction pending real rollout data
  },

  async sessionPlan() {
    return ''
  },

  async sessionLinks(sessionId) {
    const file = findRolloutSync(sessionId)
    if (!file) return []
    let raw = ''
    try {
      raw = readFileSync(file, 'utf8')
    } catch {
      return []
    }
    const owners = new Set(
      (await discoverRepos()).map((r) => r.nameWithOwner?.split('/')[0]).filter(Boolean) as string[]
    )
    const refs = new Map<string, SessionRef>()
    const re = /github\.com\/([\w.-]+)\/([\w.-]+)\/(pull|issues)\/(\d+)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(raw))) {
      const [, owner, repo, kind, num] = m
      if (!owners.has(owner)) continue
      const isPr = kind === 'pull'
      const url = `https://github.com/${owner}/${repo}/${isPr ? 'pull' : 'issues'}/${num}`
      refs.set(url, { kind: isPr ? 'pr' : 'issue', repo: `${owner}/${repo}`, number: Number(num), url })
    }
    return [...refs.values()]
  },

  buildCommand({ resumeId }) {
    // Codex has no --append-system-prompt-file; the repo map is skipped for now.
    return resumeId ? `codex resume ${resumeId}` : 'codex'
  },

  async oneShot(prompt) {
    const { stdout } = await pexec('codex', ['exec', prompt], { timeout: 120000, maxBuffer: 1024 * 1024 })
    return stdout
  },

  async registerMcp(scriptPath, controlUrl) {
    // Codex reads MCP servers from config.toml.
    try {
      const block = `\n[mcp_servers.agent-browser]\ncommand = "node"\nargs = ["${scriptPath}"]\nenv = { CONTROL_URL = "${controlUrl}" }\n`
      const existing = existsSync(CONFIG) ? await readFile(CONFIG, 'utf8') : ''
      if (existing.includes('[mcp_servers.agent-browser]')) return { ok: true, message: 'Already connected.' }
      const { writeFile, mkdir } = await import('fs/promises')
      await mkdir(DIR, { recursive: true })
      await writeFile(CONFIG, existing + block, 'utf8')
      return { ok: true, message: 'Added to ~/.codex/config.toml. Restart codex to load it.' }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  },

  async checkMcp() {
    try {
      return existsSync(CONFIG) && readFileSync(CONFIG, 'utf8').includes('[mcp_servers.agent-browser]')
    } catch {
      return false
    }
  }
}
