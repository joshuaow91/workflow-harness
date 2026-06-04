// Shared types used across the Electron main, preload, and renderer.
// Keep this file dependency-free so it can be imported from any process.

// ---- Settings ----

export interface AppSettings {
  /** Directory used to launch new claude sessions / shells when no repo or session cwd is given. */
  defaultSessionDir: string
  /** Name of the active Ghostty theme. */
  themeName: string
}

// ---- Claude sidebar ----

export interface ClaudeSession {
  sessionId: string
  /** Display title: ai-title line if present, else first user message (truncated). */
  title: string
  /** Real working directory from the JSONL `cwd` field (authoritative, unlike the slug). */
  cwd: string
  gitBranch: string | null
  /** ISO timestamp of the first line. */
  startedAt: string | null
  /** ISO timestamp / mtime of the last activity, for sorting. */
  lastActivityAt: string | null
  /** ms epoch from sessions/<pid>.json if this session is live, else null. */
  live: { pid: number; status: string } | null
  messageCount: number
}

export interface ClaudeProject {
  /** Directory slug under ~/.claude/projects (lossy; key only). */
  slug: string
  /** Best-effort real path, resolved from session cwd fields. */
  path: string
  /** Last path segment for display. */
  name: string
  sessions: ClaudeSession[]
}

// ---- Worktrees / repos ----

export interface Worktree {
  path: string
  branch: string | null
  head: string | null
  isMain: boolean
  locked: boolean
}

export interface Repo {
  name: string
  path: string
  /** owner/name parsed from the origin remote, if any. */
  nameWithOwner: string | null
  currentBranch: string | null
  worktrees: Worktree[]
}

// ---- Terminal ----

export interface TerminalSpawnOptions {
  cwd: string
  /** Optional command typed into the shell on start, e.g. "claude" or "claude --resume <id>". */
  initialCommand?: string
  /** Short label shown in the pane header; defaults to the cwd basename. */
  label?: string
  cols?: number
  rows?: number
}

export interface TerminalDataEvent {
  id: string
  data: string
}

export interface TerminalExitEvent {
  id: string
  exitCode: number
  signal?: number
}

// ---- GitHub (gh CLI) ----

export interface GhLabel {
  name: string
  color: string
}

export interface GhIssue {
  number: number
  title: string
  state: string
  labels: GhLabel[]
  assignees: string[]
  updatedAt: string
  url: string
}

export interface GhPullRequest {
  number: number
  title: string
  state: string
  isDraft: boolean
  headRefName: string
  reviewDecision: string | null
  /** Rolled-up CI state: SUCCESS | FAILURE | PENDING | null. */
  checksState: string | null
  author: string
  updatedAt: string
  url: string
  repo: string
}

export interface GhProjectSummary {
  number: number
  title: string
  url: string
}

export interface GhProjectItem {
  id: string
  title: string
  status: string | null
  type: 'Issue' | 'PullRequest' | 'DraftIssue'
  url: string | null
  repo: string | null
}

export interface GhProjectBoard {
  title: string
  number: number
  url: string
  columns: string[]
  items: GhProjectItem[]
}

/** Thrown (as an Error message substring) when the gh token lacks read:project. */
export const GH_MISSING_PROJECT_SCOPE = 'GH_MISSING_PROJECT_SCOPE'
