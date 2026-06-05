import { homedir } from 'os'
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AgentActivity,
  AgentInfo,
  AppSettings,
  AutoUpdateStatus,
  BrowserHistoryEntry,
  ClaudeProject,
  GitChanges,
  DatadogDashboard,
  GhIssue,
  GhIssueDetail,
  GhIssueEdit,
  GhRateLimit,
  MongoDatabase,
  ObsidianNote,
  ObsidianTheme,
  RepoKnowledge,
  SessionRef,
  SessionTask,
  SetupCheck,
  GhProjectBoard,
  GhProjectSummary,
  GhPullRequest,
  Repo,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalSpawnOptions,
  Worktree
} from '@shared/types'

/** Subscribe helper that returns an unsubscribe function. */
function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  claude: {
    getProjects: (): Promise<ClaudeProject[]> => ipcRenderer.invoke(IPC.claude.getProjects),
    deleteSession: (slug: string, sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.claude.deleteSession, slug, sessionId),
    sessionTasks: (sessionId: string): Promise<SessionTask[]> =>
      ipcRenderer.invoke(IPC.claude.sessionTasks, sessionId),
    sessionLinks: (sessionId: string): Promise<SessionRef[]> =>
      ipcRenderer.invoke(IPC.claude.sessionLinks, sessionId),
    sessionPlan: (sessionId: string): Promise<string> =>
      ipcRenderer.invoke(IPC.claude.sessionPlan, sessionId),
    onSidebarUpdate: (cb: (projects: ClaudeProject[]) => void) =>
      on<ClaudeProject[]>(IPC.claude.sidebarUpdate, cb)
  },
  worktree: {
    listRepos: (): Promise<Repo[]> => ipcRenderer.invoke(IPC.worktree.listRepos),
    add: (repoPath: string, branch: string, fromRef?: string): Promise<Worktree> =>
      ipcRenderer.invoke(IPC.worktree.add, repoPath, branch, fromRef),
    remove: (repoPath: string, worktreePath: string): Promise<void> =>
      ipcRenderer.invoke(IPC.worktree.remove, repoPath, worktreePath)
  },
  terminal: {
    create: (opts: TerminalSpawnOptions): Promise<string> =>
      ipcRenderer.invoke(IPC.terminal.create, opts),
    getBuffer: (id: string): Promise<string> => ipcRenderer.invoke(IPC.terminal.getBuffer, id),
    write: (id: string, data: string): void => {
      ipcRenderer.send(IPC.terminal.write, id, data)
    },
    resize: (id: string, cols: number, rows: number): void => {
      ipcRenderer.send(IPC.terminal.resize, id, cols, rows)
    },
    kill: (id: string): void => {
      ipcRenderer.send(IPC.terminal.kill, id)
    },
    onData: (cb: (e: TerminalDataEvent) => void) => on<TerminalDataEvent>(IPC.terminal.data, cb),
    onExit: (cb: (e: TerminalExitEvent) => void) => on<TerminalExitEvent>(IPC.terminal.exit, cb)
  },
  github: {
    issues: (repo: string, state?: string, search?: string, limit?: number): Promise<GhIssue[]> =>
      ipcRenderer.invoke(IPC.github.issues, repo, state, search, limit),
    issueDetail: (repo: string, number: number): Promise<GhIssueDetail> =>
      ipcRenderer.invoke(IPC.github.issueDetail, repo, number),
    addComment: (repo: string, number: number, body: string): Promise<void> =>
      ipcRenderer.invoke(IPC.github.addComment, repo, number, body),
    setIssueState: (repo: string, number: number, action: 'close' | 'reopen'): Promise<void> =>
      ipcRenderer.invoke(IPC.github.setIssueState, repo, number, action),
    fetchAsset: (url: string): Promise<string> => ipcRenderer.invoke(IPC.github.fetchAsset, url),
    rateLimit: (): Promise<GhRateLimit> => ipcRenderer.invoke(IPC.github.rateLimit),
    repoLabels: (repo: string): Promise<{ name: string; color: string }[]> =>
      ipcRenderer.invoke(IPC.github.repoLabels, repo),
    repoAssignees: (repo: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC.github.repoAssignees, repo),
    repoMilestones: (repo: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC.github.repoMilestones, repo),
    editIssue: (repo: string, number: number, patch: GhIssueEdit): Promise<void> =>
      ipcRenderer.invoke(IPC.github.editIssue, repo, number, patch),
    myPRs: (repo: string): Promise<GhPullRequest[]> => ipcRenderer.invoke(IPC.github.myPRs, repo),
    myPRsAll: (): Promise<GhPullRequest[]> => ipcRenderer.invoke(IPC.github.myPRsAll),
    reviewPRs: (): Promise<GhPullRequest[]> => ipcRenderer.invoke(IPC.github.reviewPRs),
    listProjects: (owner: string): Promise<GhProjectSummary[]> =>
      ipcRenderer.invoke(IPC.github.listProjects, owner),
    projectItems: (owner: string, number: number, force?: boolean): Promise<GhProjectBoard> =>
      ipcRenderer.invoke(IPC.github.projectItems, owner, number, force),
    setProjectField: (
      projectId: string,
      itemId: string,
      fieldId: string,
      optionId: string
    ): Promise<void> =>
      ipcRenderer.invoke(IPC.github.setProjectField, projectId, itemId, fieldId, optionId),
    enrichLinks: (refs: SessionRef[]): Promise<SessionRef[]> =>
      ipcRenderer.invoke(IPC.github.enrichLinks, refs)
  },
  browser: {
    onOpenTab: (cb: (payload: { url: string; sourceId: number }) => void) =>
      on<{ url: string; sourceId: number }>(IPC.browser.openTab, cb),
    recordVisit: (url: string, title: string): void => {
      ipcRenderer.send(IPC.browser.recordVisit, url, title)
    },
    suggest: (query: string): Promise<BrowserHistoryEntry[]> =>
      ipcRenderer.invoke(IPC.browser.suggest, query)
  },
  agent: {
    setTarget: (webContentsId: number | null): Promise<void> =>
      ipcRenderer.invoke(IPC.agent.setTarget, webContentsId),
    connectClaude: (): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke(IPC.agent.connectClaude),
    checkConnected: (): Promise<boolean> => ipcRenderer.invoke(IPC.agent.checkConnected),
    info: (): Promise<AgentInfo> => ipcRenderer.invoke(IPC.agent.info),
    list: (): Promise<(AgentInfo & { installed: boolean })[]> => ipcRenderer.invoke(IPC.agent.list),
    command: (opts: { resumeId?: string; mapFile?: string }): Promise<string> =>
      ipcRenderer.invoke(IPC.agent.command, opts),
    onActivity: (cb: (a: AgentActivity) => void) => on<AgentActivity>(IPC.agent.activity, cb)
  },
  devtools: {
    attach: (targetId: number, devtoolsId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.devtools.attach, targetId, devtoolsId),
    detach: (targetId: number): Promise<void> => ipcRenderer.invoke(IPC.devtools.detach, targetId)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settings.get),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.settings.set, patch)
  },
  datadog: {
    listDashboards: (): Promise<DatadogDashboard[]> =>
      ipcRenderer.invoke(IPC.datadog.listDashboards)
  },
  obsidian: {
    listNotes: (): Promise<ObsidianNote[]> => ipcRenderer.invoke(IPC.obsidian.listNotes),
    readNote: (path: string): Promise<string> => ipcRenderer.invoke(IPC.obsidian.readNote, path),
    saveNote: (path: string, content: string): Promise<void> =>
      ipcRenderer.invoke(IPC.obsidian.saveNote, path, content),
    createNote: (name: string): Promise<string> => ipcRenderer.invoke(IPC.obsidian.createNote, name),
    deleteNote: (path: string): Promise<void> => ipcRenderer.invoke(IPC.obsidian.deleteNote, path),
    theme: (): Promise<ObsidianTheme> => ipcRenderer.invoke(IPC.obsidian.theme)
  },
  mermaid: {
    onRender: (cb: (code: string) => void) => on<string>(IPC.mermaid.render, cb),
    generate: (prompt: string): Promise<string> => ipcRenderer.invoke(IPC.mermaid.generate, prompt)
  },
  mongo: {
    listDatabases: (): Promise<MongoDatabase[]> => ipcRenderer.invoke(IPC.mongo.listDatabases),
    listCollections: (db: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC.mongo.listCollections, db),
    run: (
      db: string,
      coll: string,
      operation: 'find' | 'aggregate',
      query: string,
      limit: number
    ): Promise<unknown[]> => ipcRenderer.invoke(IPC.mongo.run, db, coll, operation, query, limit),
    aiQuery: (db: string, prompt: string): Promise<string> =>
      ipcRenderer.invoke(IPC.mongo.aiQuery, db, prompt)
  },
  autoUpdate: {
    status: (): Promise<AutoUpdateStatus> => ipcRenderer.invoke(IPC.autoUpdate.status),
    runNow: (): Promise<unknown> => ipcRenderer.invoke(IPC.autoUpdate.runNow)
  },
  diff: {
    changes: (path: string, branchMode: boolean): Promise<GitChanges> =>
      ipcRenderer.invoke(IPC.diff.changes, path, branchMode),
    fileDiff: (path: string, file: string, branchMode: boolean): Promise<string> =>
      ipcRenderer.invoke(IPC.diff.fileDiff, path, file, branchMode)
  },
  knowledge: {
    get: (): Promise<RepoKnowledge[]> => ipcRenderer.invoke(IPC.knowledge.get),
    generate: (repoPath: string): Promise<RepoKnowledge> =>
      ipcRenderer.invoke(IPC.knowledge.generate, repoPath),
    mapInfo: (): Promise<{ path: string; available: boolean }> =>
      ipcRenderer.invoke(IPC.knowledge.mapInfo)
  },
  system: {
    homeDir: homedir(),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.system.openExternal, url),
    openInBrave: (url: string): Promise<void> => ipcRenderer.invoke(IPC.system.openInBrave, url),
    pickDirectory: (defaultPath?: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC.system.pickDirectory, defaultPath),
    openTotpWindow: (): Promise<void> => ipcRenderer.invoke(IPC.system.openTotpWindow),
    checkSetup: (): Promise<SetupCheck[]> => ipcRenderer.invoke(IPC.system.checkSetup),
    notify: (title: string, body: string): Promise<void> =>
      ipcRenderer.invoke(IPC.system.notify, title, body)
  }
}

export type HarnessApi = typeof api

contextBridge.exposeInMainWorld('api', api)
