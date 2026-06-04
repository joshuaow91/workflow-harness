// Central registry of IPC channel names, shared by main and preload so the
// two never drift. Renderer never sees these strings directly — it talks to
// the typed `window.api` surface defined in the preload.

export const IPC = {
  claude: {
    getProjects: 'claude:getProjects',
    sidebarUpdate: 'claude:sidebarUpdate' // main -> renderer push
  },
  worktree: {
    listRepos: 'worktree:listRepos',
    add: 'worktree:add',
    remove: 'worktree:remove'
  },
  terminal: {
    create: 'terminal:create',
    write: 'terminal:write',
    resize: 'terminal:resize',
    kill: 'terminal:kill',
    data: 'terminal:data', // main -> renderer push
    exit: 'terminal:exit' // main -> renderer push
  },
  github: {
    issues: 'github:issues',
    myPRs: 'github:myPRs',
    reviewPRs: 'github:reviewPRs',
    board: 'github:board'
  },
  system: {
    openExternal: 'system:openExternal'
  }
} as const
