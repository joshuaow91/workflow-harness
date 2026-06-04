// Central registry of IPC channel names, shared by main and preload so the
// two never drift. Renderer never sees these strings directly — it talks to
// the typed `window.api` surface defined in the preload.

export const IPC = {
  claude: {
    getProjects: 'claude:getProjects',
    deleteSession: 'claude:deleteSession',
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
    myPRsAll: 'github:myPRsAll',
    reviewPRs: 'github:reviewPRs',
    listProjects: 'github:listProjects',
    projectItems: 'github:projectItems'
  },
  browser: {
    openTab: 'browser:openTab' // main -> renderer push (open url in web workspace)
  },
  agent: {
    setTarget: 'agent:setTarget',
    connectClaude: 'agent:connectClaude',
    checkConnected: 'agent:checkConnected',
    activity: 'agent:activity' // main -> renderer push
  },
  devtools: {
    attach: 'devtools:attach',
    detach: 'devtools:detach'
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set'
  },
  datadog: {
    listDashboards: 'datadog:listDashboards'
  },
  obsidian: {
    listNotes: 'obsidian:listNotes',
    readNote: 'obsidian:readNote',
    saveNote: 'obsidian:saveNote'
  },
  mermaid: {
    render: 'mermaid:render', // main -> renderer push (code from Claude)
    generate: 'mermaid:generate' // renderer -> main (prompt claude for a diagram)
  },
  mongo: {
    listDatabases: 'mongo:listDatabases',
    listCollections: 'mongo:listCollections',
    run: 'mongo:run',
    aiQuery: 'mongo:aiQuery'
  },
  knowledge: {
    get: 'knowledge:get',
    generate: 'knowledge:generate'
  },
  system: {
    openExternal: 'system:openExternal',
    openInBrave: 'system:openInBrave',
    pickDirectory: 'system:pickDirectory',
    openTotpWindow: 'system:openTotpWindow'
  }
} as const
