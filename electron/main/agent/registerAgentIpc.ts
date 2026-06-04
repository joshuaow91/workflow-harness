import { execFile } from 'child_process'
import { join } from 'path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { setAgentTarget } from './BrowserController'
import { CONTROL_PORT, setActivitySink, setMermaidSink, startControlServer } from './controlServer'

// Absolute path to the standalone MCP server script (resolves from the project
// root in dev; bundled under resources when packaged).
function mcpScriptPath(): string {
  return join(app.getAppPath(), 'mcp', 'agent-browser.mjs')
}

export function registerAgentIpc(getWindow: () => BrowserWindow | null): void {
  startControlServer()

  setActivitySink((activity) => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(IPC.agent.activity, activity)
  })

  setMermaidSink((code) => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(IPC.mermaid.render, code)
  })

  ipcMain.handle(IPC.agent.setTarget, (_e, webContentsId: number | null) => {
    setAgentTarget(webContentsId)
  })

  // Is the agent-browser MCP already registered with Claude?
  ipcMain.handle(IPC.agent.checkConnected, (): Promise<boolean> => {
    return new Promise((resolve) => {
      execFile('claude', ['mcp', 'get', 'agent-browser'], (err) => resolve(!err))
    })
  })

  // Register the MCP server with Claude Code (user scope) so `claude` picks it up.
  ipcMain.handle(IPC.agent.connectClaude, (): Promise<{ ok: boolean; message: string }> => {
    return new Promise((resolve) => {
      const args = [
        'mcp',
        'add',
        'agent-browser',
        '-s',
        'user',
        '-e',
        `CONTROL_URL=http://127.0.0.1:${CONTROL_PORT}`,
        '--',
        'node',
        mcpScriptPath()
      ]
      execFile('claude', args, (err, _stdout, stderr) => {
        if (err && !/already exists/i.test(stderr)) {
          resolve({ ok: false, message: (stderr || err.message).trim() })
        } else {
          resolve({ ok: true, message: 'Connected. Restart any running claude session to load it.' })
        }
      })
    })
  })
}
