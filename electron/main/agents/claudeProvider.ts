import { execFile } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { buildProjects, deleteSession } from '../claude/ClaudeStore'
import { getSessionLinks, getSessionPlan, getSessionTasks } from '../claude/sessionTasks'
import type { AgentProvider } from './types'

const pexec = promisify(execFile)
const DIR = join(homedir(), '.claude')

export const claudeProvider: AgentProvider = {
  id: 'claude',
  label: 'Claude Code',
  cli: 'claude',
  watchPaths: () => [join(DIR, 'projects'), join(DIR, 'sessions')],

  async isInstalled() {
    try {
      const { stdout } = await pexec('claude', ['--version'])
      return { ok: true, version: stdout.split('\n')[0].trim() }
    } catch {
      return { ok: false, version: '' }
    }
  },

  getProjects: () => buildProjects(),
  deleteSession: (slug, id) => deleteSession(slug, id),
  sessionTasks: (id) => getSessionTasks(id),
  sessionLinks: (id) => getSessionLinks(id),
  sessionPlan: (id) => getSessionPlan(id),

  buildCommand({ resumeId, mapFile }) {
    const base = resumeId ? `claude --resume ${resumeId}` : 'claude'
    return mapFile ? `${base} --append-system-prompt-file '${mapFile}'` : base
  },

  async oneShot(prompt) {
    const { stdout } = await pexec('claude', ['-p', prompt], { timeout: 120000, maxBuffer: 1024 * 1024 })
    return stdout
  },

  async registerMcp(scriptPath, controlUrl) {
    try {
      await pexec('claude', [
        'mcp',
        'add',
        'agent-browser',
        '-s',
        'user',
        '-e',
        `CONTROL_URL=${controlUrl}`,
        '--',
        'node',
        scriptPath
      ])
      return { ok: true, message: 'Connected. Restart any running claude session to load it.' }
    } catch (e) {
      const stderr = (e as { stderr?: string }).stderr ?? (e as Error).message
      if (/already exists/i.test(stderr)) return { ok: true, message: 'Already connected.' }
      return { ok: false, message: stderr.trim() }
    }
  },

  async checkMcp() {
    try {
      await pexec('claude', ['mcp', 'get', 'agent-browser'])
      return true
    } catch {
      return false
    }
  }
}
