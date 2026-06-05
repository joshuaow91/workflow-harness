// Shared types used across the Electron main, preload, and renderer.
// Keep this file dependency-free so it can be imported from any process.

// ---- Settings ----

export interface AppSettings {
  /** Directory used to launch new claude sessions / shells when no repo or session cwd is given. */
  defaultSessionDir: string
  /** Name of the active Ghostty theme. */
  themeName: string
  /** URL that new browser tabs open to. */
  defaultBrowserUrl: string
  /** User-renamed session titles, keyed by sessionId. */
  sessionTitles: Record<string, string>
  /** Built-in authenticator (TOTP) accounts. Secrets stored locally in plaintext. */
  totpAccounts: TotpAccount[]
  /** Datadog API credentials (fallback to DD_API_KEY/DD_APP_KEY/DD_SITE env). */
  ddApiKey: string
  ddAppKey: string
  ddSite: string
  /** Absolute path to the Obsidian vault directory. */
  obsidianVault: string
  /** MongoDB connection string (fallback to MONGODB_URI env). */
  mongoUri: string
  /** Custom sidebar repo order (by repo path); unlisted repos sort after, alphabetically. */
  repoOrder: string[]
  /** Inject the repo knowledge map into new claude sessions (when a map exists). */
  injectRepoMap: boolean
  /** Auto fast-forward repos/worktrees from their upstream on a schedule. */
  autoUpdateRepos: 'off' | 'hourly' | 'daily'
  /** Browser bookmarks for quick opening. */
  bookmarks: Bookmark[]
  /** Apply the vault's active Obsidian theme palette to the Notes editor. */
  useObsidianTheme: boolean
}

export interface UpdateResult {
  repo: string
  branch: string
  status: 'updated' | 'skipped' | 'error'
  detail?: string
}

export interface AutoUpdateStatus {
  interval: 'off' | 'hourly' | 'daily'
  lastRunAt: number | null
  running: boolean
  results: UpdateResult[]
}

export interface MongoDatabase {
  name: string
  sizeOnDisk?: number
}

// ---- Repo knowledge graph ----

export interface RepoKnowledge {
  name: string
  path: string
  defaultBranch: string | null
  purpose: string
  stack: string
  keyPaths: string[]
  /** Names of other repos this one integrates with / depends on. */
  related: string[]
  summary: string
  updatedAt: number
}

export interface ObsidianTheme {
  /** Active community theme name, or null if using the default. */
  name: string | null
  scheme: 'dark' | 'light'
  /** Raw theme.css (empty if default theme). */
  css: string
}

export interface ObsidianNote {
  /** Path relative to the vault root, e.g. "Work/Ideas.md". */
  path: string
  title: string
  folder: string
  mtime: number
}

export interface DatadogDashboard {
  id: string
  title: string
  url: string
  /** Custom (user-authored) dashboards have alphanumeric ids; built-ins are numeric. */
  custom: boolean
}

export interface TotpAccount {
  id: string
  label: string
  /** Base32-encoded shared secret. */
  secret: string
}

// ---- Agent browser ----

export interface AgentActivity {
  tool: string
  ok: boolean
  detail: string
  at: number
}

// ---- Per-session progress ----

export interface SessionTask {
  id: number
  subject: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed'
}

export interface FileChange {
  path: string
  /** M modified, A added, D deleted, R renamed, ? untracked. */
  status: string
  additions: number
  deletions: number
  binary: boolean
}

export interface GitChanges {
  /** The base ref when in branch mode (e.g. origin/main), else null. */
  base: string | null
  files: FileChange[]
}

export interface BrowserHistoryEntry {
  url: string
  title: string
  visits: number
  last: number
}

export interface Bookmark {
  url: string
  title: string
}

export interface SessionRef {
  kind: 'pr' | 'issue'
  repo: string
  number: number
  url: string
  /** Current state from gh: OPEN | CLOSED | MERGED (filled by enrichLinks). */
  state?: string
  isDraft?: boolean
  reviewDecision?: string
  /** Project board Status single-select (e.g. "In Review"), if on a Projects v2 board. */
  boardStatus?: string
}

export interface SetupCheck {
  name: string
  ok: boolean
  required: boolean
  detail: string
  /** A shell command or instruction to satisfy this requirement. */
  fix?: string
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
  /** Detected default branch (main/master), for branching new worktrees off. */
  defaultBranch: string | null
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
  milestone: string | null
}

export interface GhIssueComment {
  author: string
  body: string
  createdAt: string
}

export interface GhIssueDetail {
  number: number
  title: string
  body: string
  state: string
  author: string
  labels: GhLabel[]
  assignees: string[]
  url: string
  createdAt: string
  milestone: string | null
  boardStatus: string | null
  comments: GhIssueComment[]
}

export interface GhIssueEdit {
  addLabels?: string[]
  removeLabels?: string[]
  addAssignees?: string[]
  removeAssignees?: string[]
  /** string = set milestone, null = remove, undefined = leave unchanged. */
  milestone?: string | null
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

export interface GhProjectFieldOption {
  id: string
  name: string
}

export interface GhProjectField {
  id: string
  name: string
  options: GhProjectFieldOption[]
}

export interface GhProjectItem {
  /** ProjectV2 item node id (PVTI_…), used for field mutations. */
  id: string
  title: string
  type: 'Issue' | 'PullRequest' | 'DraftIssue'
  url: string | null
  repo: string | null
  assignees: string[]
  /** Single-select field values keyed by field display name (e.g. Status, Priority). */
  fieldValues: Record<string, string>
}

export interface GhProjectBoard {
  title: string
  number: number
  url: string
  projectId: string
  fields: GhProjectField[]
  items: GhProjectItem[]
}

/** Thrown (as an Error message substring) when the gh token lacks read:project. */
export const GH_MISSING_PROJECT_SCOPE = 'GH_MISSING_PROJECT_SCOPE'
