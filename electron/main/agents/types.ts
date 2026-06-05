import type { ClaudeProject, SessionRef, SessionTask } from '@shared/types'

// One interface for everything agent-specific, so the harness works with any
// coding agent (Claude Code, Codex, future). Generic surfaces don't use this.
export interface AgentProvider {
  id: string
  label: string
  /** CLI binary name. */
  cli: string
  /** Filesystem paths to watch for live sidebar updates. */
  watchPaths(): string[]
  isInstalled(): Promise<{ ok: boolean; version: string }>

  /** Sidebar data: projects → sessions. */
  getProjects(): Promise<ClaudeProject[]>
  deleteSession(slug: string, sessionId: string): Promise<void>
  sessionTasks(sessionId: string): Promise<SessionTask[]>
  sessionLinks(sessionId: string): Promise<SessionRef[]>
  sessionPlan(sessionId: string): Promise<string>

  /** Terminal command to start/resume the agent (optional repo-map, initial prompt, plan mode). */
  buildCommand(opts: { resumeId?: string; mapFile?: string; prompt?: string; plan?: boolean }): string
  /** One-shot non-interactive prompt (used for Mermaid/AI helpers). */
  oneShot(prompt: string): Promise<string>

  registerMcp(scriptPath: string, controlUrl: string): Promise<{ ok: boolean; message: string }>
  checkMcp(): Promise<boolean>
}
