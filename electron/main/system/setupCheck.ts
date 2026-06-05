import { execFile } from 'child_process'
import { promisify } from 'util'
import type { SetupCheck } from '@shared/types'
import { getSettings } from '../settings/SettingsStore'

const pexec = promisify(execFile)

async function run(cmd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  try {
    const { stdout, stderr } = await pexec(cmd, args, { maxBuffer: 1024 * 1024 })
    return { ok: true, out: (stdout || stderr || '').trim() }
  } catch (e) {
    return { ok: false, out: ((e as { stderr?: string }).stderr || (e as Error).message || '').trim() }
  }
}

// Inspect the local machine for everything the harness needs and report status +
// how to fix each gap, so a new teammate can self-serve.
export async function checkSetup(): Promise<SetupCheck[]> {
  const checks: SetupCheck[] = []

  const git = await run('git', ['--version'])
  checks.push({
    name: 'git',
    required: true,
    ok: git.ok,
    detail: git.ok ? git.out : 'Not found on PATH',
    fix: git.ok ? undefined : 'Install Xcode Command Line Tools: xcode-select --install'
  })

  const gh = await run('gh', ['--version'])
  checks.push({
    name: 'GitHub CLI (gh)',
    required: true,
    ok: gh.ok,
    detail: gh.ok ? gh.out.split('\n')[0] : 'Not found on PATH',
    fix: gh.ok ? undefined : 'brew install gh'
  })

  if (gh.ok) {
    const auth = await run('gh', ['auth', 'status'])
    const loggedIn = /Logged in/i.test(auth.out)
    checks.push({
      name: 'gh authenticated',
      required: true,
      ok: loggedIn,
      detail: loggedIn ? auth.out.split('\n').find((l) => /Logged in/i.test(l))?.trim() ?? 'Logged in' : 'Not logged in',
      fix: loggedIn ? undefined : 'gh auth login'
    })
    const scopes = auth.out.match(/Token scopes:\s*(.+)/)?.[1] ?? ''
    const needed = ['repo', 'read:org', 'read:project']
    const missing = needed.filter((s) => !scopes.includes(s))
    checks.push({
      name: 'gh scopes — repo, read:org, read:project',
      required: false,
      ok: missing.length === 0,
      detail: scopes ? `Granted: ${scopes.replace(/'/g, '')}` : 'Unknown',
      fix: missing.length ? `gh auth refresh -s ${missing.join(',')}` : undefined
    })
  }

  const claude = await run('claude', ['--version'])
  checks.push({
    name: 'Claude Code CLI (claude)',
    required: true,
    ok: claude.ok,
    detail: claude.ok ? claude.out.split('\n')[0] : 'Not found on PATH',
    fix: claude.ok ? undefined : 'npm install -g @anthropic-ai/claude-code  (see claude.com/claude-code)'
  })

  if (claude.ok) {
    const mcp = await run('claude', ['mcp', 'list'])
    const has = /agent-browser/.test(mcp.out)
    checks.push({
      name: 'Harness MCP (agent-browser)',
      required: false,
      ok: has,
      detail: has ? 'Registered — Claude can use repo_knowledge / browser tools' : 'Not registered',
      fix: has ? undefined : 'Open the Agent tab → "Connect Claude"'
    })
  }

  checks.push({ name: 'Node.js runtime', required: true, ok: true, detail: process.version })

  const s = getSettings()
  checks.push({
    name: 'Default session directory',
    required: true,
    ok: !!s.defaultSessionDir,
    detail: s.defaultSessionDir || 'Not set',
    fix: s.defaultSessionDir ? undefined : 'Set it in Settings → Default session directory'
  })
  checks.push({
    name: 'MongoDB connection (optional)',
    required: false,
    ok: !!s.mongoUri,
    detail: s.mongoUri ? 'Configured' : 'Not set — the Mongo tab is disabled',
    fix: s.mongoUri ? undefined : 'Settings → Mongo connection string'
  })
  checks.push({
    name: 'Datadog API keys (optional)',
    required: false,
    ok: !!(s.ddApiKey && s.ddAppKey),
    detail: s.ddApiKey && s.ddAppKey ? 'Configured' : 'Not set — native Datadog views disabled',
    fix: s.ddApiKey && s.ddAppKey ? undefined : 'Settings → Datadog API + App keys'
  })
  checks.push({
    name: 'Obsidian vault (optional)',
    required: false,
    ok: !!s.obsidianVault,
    detail: s.obsidianVault ? 'Configured' : 'Not set — the Notes tab is disabled',
    fix: s.obsidianVault ? undefined : 'Settings → Obsidian vault path'
  })

  return checks
}
