import { join } from 'path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { setAgentTarget } from './BrowserController'
import { CONTROL_PORT, setActivitySink, setMermaidSink, startControlServer } from './controlServer'
import { activeProvider, providers } from '../agents/registry'

function mcpScriptPathExt(): string {
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

  // Generate a Mermaid diagram by prompting the active agent's CLI.
  ipcMain.handle(IPC.mermaid.generate, async (_e, prompt: string): Promise<string> => {
    const full = `Create a Mermaid diagram for this request. Output ONLY valid Mermaid source — no explanation, no markdown code fences.\n\nRequest: ${prompt}`
    const out = await activeProvider().oneShot(full)
    return out
      .replace(/^\s*```(?:mermaid)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim()
  })

  ipcMain.handle(IPC.agent.info, () => {
    const p = activeProvider()
    return { id: p.id, label: p.label, cli: p.cli }
  })

  ipcMain.handle(IPC.agent.list, async () =>
    Promise.all(
      providers.map(async (p) => ({ id: p.id, label: p.label, cli: p.cli, installed: (await p.isInstalled()).ok }))
    )
  )

  ipcMain.handle(IPC.agent.command, (_e, opts: { resumeId?: string; mapFile?: string }) =>
    activeProvider().buildCommand(opts)
  )

  // Is the agent-browser MCP registered with the active agent?
  ipcMain.handle(IPC.agent.checkConnected, () => activeProvider().checkMcp())

  // Register the MCP server with the active agent.
  ipcMain.handle(IPC.agent.connectClaude, () =>
    activeProvider().registerMcp(mcpScriptPathExt(), `http://127.0.0.1:${CONTROL_PORT}`)
  )
}
