// Central registry of IPC channel names, shared by main and preload so the
// two never drift. Renderer never sees these strings directly — it talks to
// the typed `window.api` surface defined in the preload.

export const IPC = {
  claude: {
    getProjects: 'claude:getProjects',
    deleteSession: 'claude:deleteSession',
    sessionTasks: 'claude:sessionTasks',
    sessionLinks: 'claude:sessionLinks',
    sessionPlan: 'claude:sessionPlan',
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
    getBuffer: 'terminal:getBuffer',
    data: 'terminal:data', // main -> renderer push
    exit: 'terminal:exit' // main -> renderer push
  },
  github: {
    issues: 'github:issues',
    myPRs: 'github:myPRs',
    myPRsAll: 'github:myPRsAll',
    reviewPRs: 'github:reviewPRs',
    listProjects: 'github:listProjects',
    projectItems: 'github:projectItems',
    setProjectField: 'github:setProjectField',
    prStatus: 'github:prStatus',
    prGreptile: 'github:prGreptile',
    prDiff: 'github:prDiff',
    resolveThread: 'github:resolveThread',
    deferThread: 'github:deferThread',
    enrichLinks: 'github:enrichLinks',
    issueDetail: 'github:issueDetail',
    addComment: 'github:addComment',
    setIssueState: 'github:setIssueState',
    fetchAsset: 'github:fetchAsset',
    rateLimit: 'github:rateLimit',
    repoLabels: 'github:repoLabels',
    repoAssignees: 'github:repoAssignees',
    repoMilestones: 'github:repoMilestones',
    editIssue: 'github:editIssue'
  },
  browser: {
    openTab: 'browser:openTab', // main -> renderer push (open url in web workspace)
    recordVisit: 'browser:recordVisit',
    suggest: 'browser:suggest'
  },
  agent: {
    setTarget: 'agent:setTarget',
    connectClaude: 'agent:connectClaude',
    checkConnected: 'agent:checkConnected',
    command: 'agent:command',
    info: 'agent:info',
    list: 'agent:list',
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
    saveNote: 'obsidian:saveNote',
    createNote: 'obsidian:createNote',
    deleteNote: 'obsidian:deleteNote',
    theme: 'obsidian:theme'
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
    generate: 'knowledge:generate',
    mapInfo: 'knowledge:mapInfo'
  },
  autoUpdate: {
    status: 'autoUpdate:status',
    runNow: 'autoUpdate:runNow'
  },
  diff: {
    changes: 'diff:changes',
    fileDiff: 'diff:fileDiff'
  },
  system: {
    openExternal: 'system:openExternal',
    openInBrave: 'system:openInBrave',
    pickDirectory: 'system:pickDirectory',
    openTotpWindow: 'system:openTotpWindow',
    checkSetup: 'system:checkSetup',
    notify: 'system:notify'
  }
} as const
