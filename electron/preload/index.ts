import { homedir } from 'os'
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AgentActivity,
  AppSettings,
  ClaudeProject,
  GhIssue,
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
    issues: (repo: string): Promise<GhIssue[]> => ipcRenderer.invoke(IPC.github.issues, repo),
    myPRs: (repo: string): Promise<GhPullRequest[]> => ipcRenderer.invoke(IPC.github.myPRs, repo),
    myPRsAll: (): Promise<GhPullRequest[]> => ipcRenderer.invoke(IPC.github.myPRsAll),
    reviewPRs: (): Promise<GhPullRequest[]> => ipcRenderer.invoke(IPC.github.reviewPRs),
    listProjects: (owner: string): Promise<GhProjectSummary[]> =>
      ipcRenderer.invoke(IPC.github.listProjects, owner),
    projectItems: (owner: string, number: number): Promise<GhProjectBoard> =>
      ipcRenderer.invoke(IPC.github.projectItems, owner, number)
  },
  browser: {
    onOpenTab: (cb: (payload: { url: string; sourceId: number }) => void) =>
      on<{ url: string; sourceId: number }>(IPC.browser.openTab, cb)
  },
  agent: {
    setTarget: (webContentsId: number | null): Promise<void> =>
      ipcRenderer.invoke(IPC.agent.setTarget, webContentsId),
    connectClaude: (): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke(IPC.agent.connectClaude),
    checkConnected: (): Promise<boolean> => ipcRenderer.invoke(IPC.agent.checkConnected),
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
  system: {
    homeDir: homedir(),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.system.openExternal, url),
    openInBrave: (url: string): Promise<void> => ipcRenderer.invoke(IPC.system.openInBrave, url),
    pickDirectory: (defaultPath?: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC.system.pickDirectory, defaultPath),
    openTotpWindow: (): Promise<void> => ipcRenderer.invoke(IPC.system.openTotpWindow)
  }
}

export type HarnessApi = typeof api

contextBridge.exposeInMainWorld('api', api)
