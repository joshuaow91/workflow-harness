import { execFile } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { app, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { RepoKnowledge } from '@shared/types'
import { discoverRepos } from '../git/WorktreeService'

function storeFile(): string {
  return join(app.getPath('userData'), 'repo-knowledge.json')
}

function loadRaw(): RepoKnowledge[] {
  try {
    return JSON.parse(readFileSync(storeFile(), 'utf8')) as RepoKnowledge[]
  } catch {
    return []
  }
}

// Drop entries whose repo directory no longer exists (e.g. a deleted repo), so
// the graph self-heals without a manual regenerate.
function load(): RepoKnowledge[] {
  const all = loadRaw()
  const pruned = all.filter((r) => existsSync(r.path))
  if (pruned.length !== all.length) {
    save(pruned)
    writeMapFile(pruned)
  }
  return pruned
}

function save(graph: RepoKnowledge[]): void {
  writeFileSync(storeFile(), JSON.stringify(graph, null, 2))
}

function mapFile(): string {
  return join(app.getPath('userData'), 'repo-map.txt')
}

function buildMap(graph: RepoKnowledge[]): string {
  const lines = [
    'WORKSPACE REPO MAP (repos live under ~/Documents/Code)',
    '',
    'Use this to identify which repos a task touches even if the user did not name them.',
    'For full detail on any repo (key paths, deeper summary), call the repo_knowledge MCP tool.',
    ''
  ]
  for (const r of graph) {
    const rel = r.related.length ? ` | related: ${r.related.join(', ')}` : ''
    lines.push(`- ${r.name} [${r.stack}] — ${r.purpose}${rel}`)
  }
  return lines.join('\n')
}

function writeMapFile(graph: RepoKnowledge[]): void {
  try {
    if (graph.length) writeFileSync(mapFile(), buildMap(graph))
  } catch {
    /* ignore */
  }
}

// Gather lightweight context (no Claude tool use needed) for one repo.
async function gatherContext(path: string): Promise<string> {
  let entries: string[] = []
  try {
    entries = (await readdir(path, { withFileTypes: true }))
      .filter((e) => !e.name.startsWith('.'))
      .slice(0, 60)
      .map((e) => (e.isDirectory() ? e.name + '/' : e.name))
  } catch {
    /* ignore */
  }
  let manifest = ''
  for (const f of ['package.json', 'go.mod', 'build.gradle', 'pom.xml', 'Cargo.toml', 'requirements.txt']) {
    if (existsSync(join(path, f))) {
      try {
        manifest = `${f}:\n${(await readFile(join(path, f), 'utf8')).slice(0, 1200)}`
        break
      } catch {
        /* ignore */
      }
    }
  }
  let readme = ''
  for (const f of ['README.md', 'readme.md', 'README']) {
    if (existsSync(join(path, f))) {
      try {
        readme = (await readFile(join(path, f), 'utf8')).slice(0, 2000)
        break
      } catch {
        /* ignore */
      }
    }
  }
  return `Top-level entries: ${entries.join(', ')}\n\n${manifest}\n\nREADME (excerpt):\n${readme}`
}

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('claude', ['-p', prompt], { timeout: 120000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()))
      resolve(
        stdout
          .replace(/^\s*```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .trim()
      )
    })
  })
}

async function generate(repoPath: string): Promise<RepoKnowledge> {
  const repos = await discoverRepos()
  const repo = repos.find((r) => r.path === repoPath)
  if (!repo) throw new Error('Repo not found: ' + repoPath)
  const allNames = repos.map((r) => r.name)

  const ctx = await gatherContext(repoPath)
  const prompt =
    `You are documenting a code repository named "${repo.name}". Based only on the context below, ` +
    `output ONLY a JSON object (no prose, no code fences):\n` +
    `{"purpose":"one sentence","stack":"main language/framework","keyPaths":["important dir or file", "..."],"related":["names of other repos this integrates with"],"summary":"2-3 sentences"}\n` +
    `Other repos in this workspace (only reference these in "related"): ${allNames.join(', ')}\n\n` +
    `Context:\n${ctx}`

  const parsed = JSON.parse(await runClaude(prompt)) as Partial<RepoKnowledge>
  const entry: RepoKnowledge = {
    name: repo.name,
    path: repo.path,
    defaultBranch: repo.defaultBranch,
    purpose: parsed.purpose ?? '',
    stack: parsed.stack ?? '',
    keyPaths: parsed.keyPaths ?? [],
    related: (parsed.related ?? []).filter((r) => allNames.includes(r) && r !== repo.name),
    summary: parsed.summary ?? '',
    updatedAt: Date.now()
  }

  const graph = load()
  const idx = graph.findIndex((r) => r.path === repo.path)
  if (idx >= 0) graph[idx] = entry
  else graph.push(entry)
  save(graph)
  writeMapFile(graph)
  return entry
}

export function getKnowledge(): RepoKnowledge[] {
  return load()
}

export function registerKnowledgeIpc(): void {
  ipcMain.handle(IPC.knowledge.get, () => load())
  ipcMain.handle(IPC.knowledge.generate, (_e, repoPath: string) => generate(repoPath))
  ipcMain.handle(IPC.knowledge.mapInfo, (): { path: string; available: boolean } => {
    const graph = load()
    if (graph.length) writeMapFile(graph)
    return { path: mapFile(), available: graph.length > 0 }
  })
}
