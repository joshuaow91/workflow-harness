// Central registry of IPC channel names, shared by main and preload so the
// two never drift. Renderer never sees these strings directly — it talks to
// the typed `window.api` surface defined in the preload.

export const IPC = {
  claude: {
    getProjects: 'claude:getProjects',
    deleteSession: 'claude:deleteSession',
    killSession: 'claude:killSession',
    sessionTasks: 'claude:sessionTasks',
    sessionLinks: 'claude:sessionLinks',
    sessionPlan: 'claude:sessionPlan',
    sessionAgents: 'claude:sessionAgents',
    sidebarUpdate: 'claude:sidebarUpdate' // main -> renderer push
  },
  worktree: {
    listRepos: 'worktree:listRepos',
    add: 'worktree:add',
    remove: 'worktree:remove'
  },
  branch: {
    status: 'branch:status',
    pullDefault: 'branch:pullDefault',
    checkout: 'branch:checkout',
    delete: 'branch:delete'
  },
  terminal: {
    create: 'terminal:create',
    write: 'terminal:write',
    resize: 'terminal:resize',
    kill: 'terminal:kill',
    state: 'terminal:state', // main -> renderer push: agent state changed
    getBuffer: 'terminal:getBuffer',
    saveLayout: 'terminal:saveLayout',
    getLayout: 'terminal:getLayout',
    sessionFor: 'terminal:sessionFor',
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
    prsInRange: 'github:prsInRange',
    prFiles: 'github:prFiles',
    enrichLinks: 'github:enrichLinks',
    weeklyStats: 'github:weeklyStats',
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
  browserView: {
    create: 'browserView:create',
    destroy: 'browserView:destroy',
    setBounds: 'browserView:setBounds',
    setVisible: 'browserView:setVisible',
    loadURL: 'browserView:loadURL',
    goBack: 'browserView:goBack',
    goForward: 'browserView:goForward',
    reload: 'browserView:reload',
    stop: 'browserView:stop',
    find: 'browserView:find',
    stopFind: 'browserView:stopFind',
    state: 'browserView:state', // main -> renderer push (per-view nav/title/loading)
    findResult: 'browserView:findResult', // main -> renderer (found-in-page matches)
    shortcut: 'browserView:shortcut' // main -> renderer (browser keyboard shortcut from a focused page)
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
    listDashboards: 'datadog:listDashboards',
    deploys: 'datadog:deploys',
    deployHealth: 'datadog:deployHealth',
    deployHotspots: 'datadog:deployHotspots'
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
  devstack: {
    services: 'devstack:services',
    state: 'devstack:state',
    activate: 'devstack:activate',
    stop: 'devstack:stop',
    logs: 'devstack:logs',
    status: 'devstack:status' // main -> renderer push
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
