import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import * as bc from './BrowserController'
import { getKnowledge } from '../knowledge/registerKnowledgeIpc'

// A localhost-only JSON command server that the standalone MCP process calls to
// drive the agent browser. No external network exposure.
export const CONTROL_PORT = 51789

type Handler = (body: Record<string, unknown>) => Promise<unknown> | unknown

export interface AgentActivity {
  tool: string
  ok: boolean
  detail: string
  at: number
}

let activitySink: ((a: AgentActivity) => void) | null = null
export function setActivitySink(fn: (a: AgentActivity) => void): void {
  activitySink = fn
}

let mermaidSink: ((code: string) => void) | null = null
export function setMermaidSink(fn: (code: string) => void): void {
  mermaidSink = fn
}

function summarize(body: Record<string, unknown>): string {
  return Object.entries(body)
    .map(([k, v]) => `${k}=${String(v).slice(0, 40)}`)
    .join(' ')
}

const handlers: Record<string, Handler> = {
  status: () => ({ ready: bc.agentReady() }),
  navigate: (b) => bc.navigate(String(b.url)),
  snapshot: () => bc.snapshot(),
  click: (b) => bc.click(String(b.ref)),
  type: (b) => bc.type(String(b.ref), String(b.text), Boolean(b.submit)),
  press: (b) => bc.pressKey(String(b.key)),
  screenshot: () => bc.screenshot(),
  eval: (b) => bc.evaluate(String(b.expression)),
  console: (b) => bc.getConsole(Number(b.limit) || 50),
  network: (b) => bc.getNetwork(Number(b.limit) || 50),
  cookies: () => bc.getCookies(),
  storage: () => bc.getStorage(),
  wait: (b) =>
    bc.waitFor({
      selector: b.selector as string | undefined,
      text: b.text as string | undefined,
      timeoutMs: b.timeoutMs as number | undefined
    }),
  upload: (b) => bc.uploadFile(String(b.ref), (b.paths as string[]) ?? []),
  mermaid: (b) => {
    mermaidSink?.(String(b.code))
    return 'rendered'
  },
  knowledge: () => getKnowledge()
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch {
        resolve({})
      }
    })
  })
}

let started = false

export function startControlServer(): void {
  if (started) return
  started = true

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Content-Type', 'application/json')
    const name = (req.url ?? '').replace(/^\/+/, '').split('?')[0]
    const handler = handlers[name]
    if (!handler) {
      res.statusCode = 404
      res.end(JSON.stringify({ ok: false, error: 'unknown command: ' + name }))
      return
    }
    const body = req.method === 'POST' ? await readBody(req) : {}
    const silent = name === 'status' || name === 'knowledge'
    try {
      const result = await handler(body)
      if (!silent) activitySink?.({ tool: name, ok: true, detail: summarize(body), at: Date.now() })
      res.end(JSON.stringify({ ok: true, result }))
    } catch (err) {
      if (!silent)
        activitySink?.({ tool: name, ok: false, detail: (err as Error).message, at: Date.now() })
      res.statusCode = 200
      res.end(JSON.stringify({ ok: false, error: (err as Error).message }))
    }
  })

  server.on('error', (err) => {
    console.error('[agent control server]', err.message)
  })
  server.listen(CONTROL_PORT, '127.0.0.1')
}
