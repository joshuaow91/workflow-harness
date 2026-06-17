// Shared types used across the Electron main, preload, and renderer.
// Keep this file dependency-free so it can be imported from any process.

// ---- Settings ----

export interface AgentInfo {
  id: string
  label: string
  cli: string
}

export interface AppSettings {
  /** Active coding agent id ('claude' | 'codex' | …). */
  agent: string
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
  /** MongoDB connection string (fallback to MONGODB_URI env). Legacy single
   *  connection; kept as the default/fallback when mongoConnections is empty. */
  mongoUri: string
  /** Named MongoDB connections (e.g. read-only Prod + Local) to switch between. */
  mongoConnections: MongoConnection[]
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
  /** Native notifications. */
  notifyPrReview: boolean
  notifyPrMerged: boolean
  notifySessionResponse: boolean
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

export interface MongoConnection {
  name: string
  uri: string
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

// ---- Deploy Watch ----

/** One deployed version of a service, detected from APM `version`-tagged traffic. */
export interface DeployInfo {
  service: string
  /** Deploy short-SHA (the `version` tag = git rev-parse --short HEAD). */
  version: string
  /** ms epoch the version first took traffic (≈ deploy time), null if never. */
  firstSeen: number | null
  /** ms epoch of the version's most recent traffic. */
  lastSeen: number | null
  /** Total request hits over the detection window (for the traffic floor). */
  hits: number
}

export type MetricVerdict = 'good' | 'neutral' | 'warn' | 'bad' | 'nodata'

export interface DeployMetric {
  key: string
  label: string
  /** 1 = request golden signals, 2 = downstream, 3 = JVM/runtime. */
  tier: 1 | 2 | 3
  /** Display unit: 's' (seconds, auto ms), '%', 'req/s', 'MB', or '' (count). */
  unit: string
  /** Which direction is better; 'info' metrics are never scored. */
  dir: 'lower' | 'higher' | 'info'
  newValue: number | null
  prevValue: number | null
  /** Percent change new-vs-prev, null when no baseline. */
  deltaPct: number | null
  verdict: MetricVerdict
}

export type DeployVerdict =
  | 'healthy'
  | 'watch'
  | 'rollback'
  | 'warming'
  | 'insufficient'
  | 'nodata'

export interface DeployHealth {
  service: string
  newVersion: string
  prevVersion: string | null
  /** ms epoch the new version was deployed. */
  deployedAt: number
  /** Length of each comparison window, ms. */
  windowMs: number
  /** New version's request hits within the window (drives the traffic floor). */
  traffic: number
  verdict: DeployVerdict
  metrics: DeployMetric[]
}

/** A PR that rode along in a deploy (resolved from the git compare range). */
export interface PrInRange {
  number: number
  title: string
  url: string
}

/** One specific operation (endpoint / query) compared across the deploy. */
export interface DeployResource {
  /** APM resource_name, e.g. "post_/v2/stores/_storeid_/cdk/user-lookup". */
  resource: string
  newValue: number | null
  prevValue: number | null
  deltaPct: number | null
  /** New-version request count over the window (for the traffic floor). */
  hits: number
  verdict: MetricVerdict
}

/** A ranked group of the worst-regressed operations of one kind. */
export interface DeployDrill {
  /** 'endpoints' | 'mongo' | 'redis' | 'http_out'. */
  family: string
  label: string
  unit: string
  rows: DeployResource[]
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
  /** The issue/PR this session is about (anchored from the launch / first message). */
  primary?: boolean
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

export interface BranchInfo {
  name: string
  current: boolean
  isDefault: boolean
  /** Upstream remote branch was deleted (typically a merged PR). */
  gone: boolean
  /** Merged into origin/<default>. */
  merged: boolean
  upstream: string | null
  /** Checked out in a secondary worktree. Deleting it removes that worktree first. */
  worktree: boolean
  /** The secondary worktree's path, when `worktree` is true. */
  worktreePath?: string
}

export interface RepoBranchStatus {
  repo: string
  path: string
  defaultBranch: string
  currentBranch: string
  /** Commits local default is behind origin/default (0 = up to date). */
  defaultBehind: number
  branches: BranchInfo[]
}

export interface BranchDeleteResult {
  deleted: string[]
  failed: { name: string; error: string }[]
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

export interface PrProjectStatus {
  projectId: string
  projectTitle: string
  itemId: string
  fieldId: string
  current: string | null
  currentOptionId: string | null
  options: { id: string; name: string }[]
}

export interface GreptileComment {
  author: string
  body: string
  path?: string
  line?: number
  url: string
}

export interface GreptileThread {
  /** GraphQL review-thread id (for resolve). */
  id: string
  isResolved: boolean
  /** databaseId of the first comment, for posting a reply (defer note). */
  replyToId: number | null
  comments: GreptileComment[]
}

export interface GreptileReview {
  /** Greptile's "Confidence Score: N/5" from the PR description, if present. */
  confidence: number | null
  /** The safe-to-merge summary following the score. */
  summary: string
  threads: GreptileThread[]
}

/** Lightweight "my activity" counters for the header bar (cached in main). */
export interface WeeklyStats {
  /** PRs I authored that merged since Monday. */
  merged: number
  /** My open PRs (org-wide). */
  open: number
  /** PRs awaiting my review. */
  toReview: number
}

export interface GhRateResource {
  remaining: number
  limit: number
  /** Reset time, unix epoch seconds. */
  reset: number
}

export interface GhRateLimit {
  graphql: GhRateResource
  core: GhRateResource
}

/** Thrown (as an Error message substring) when the gh token lacks read:project. */
export const GH_MISSING_PROJECT_SCOPE = 'GH_MISSING_PROJECT_SCOPE'
