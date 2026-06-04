#!/usr/bin/env node
// Standalone MCP server (stdio) that lets Claude Code drive the harness's
// dedicated "agent" browser pane. Spawned by Claude Code; forwards each tool
// call to the harness control server over localhost HTTP.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const CONTROL = process.env.CONTROL_URL || 'http://127.0.0.1:51789'

async function call(cmd, body) {
  let res
  try {
    res = await fetch(`${CONTROL}/${cmd}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {})
    })
  } catch {
    throw new Error(`Harness not reachable at ${CONTROL}. Is the app running?`)
  }
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || 'control error')
  return json.result
}

const text = (r) => ({
  content: [{ type: 'text', text: typeof r === 'string' ? r : JSON.stringify(r, null, 2) }]
})

const server = new McpServer({ name: 'agent-browser', version: '0.1.0' })

server.tool(
  'browser_navigate',
  'Navigate the agent browser to a URL.',
  { url: z.string().describe('Absolute URL to open') },
  async ({ url }) => text(await call('navigate', { url }))
)

server.tool(
  'browser_snapshot',
  'Get a structured snapshot of interactive elements on the page, each with a stable "ref" usable by click/type.',
  {},
  async () => text(await call('snapshot'))
)

server.tool(
  'browser_click',
  'Click the element with the given ref (from browser_snapshot).',
  { ref: z.string() },
  async ({ ref }) => text(await call('click', { ref }))
)

server.tool(
  'browser_type',
  'Type text into the element with the given ref. Set submit=true to submit its form.',
  { ref: z.string(), text: z.string(), submit: z.boolean().optional() },
  async ({ ref, text: t, submit }) => text(await call('type', { ref, text: t, submit }))
)

server.tool(
  'browser_press_key',
  'Send a key to the page (e.g. "Return", "Tab", "Escape").',
  { key: z.string() },
  async ({ key }) => text(await call('press', { key }))
)

server.tool('browser_screenshot', 'Capture a PNG screenshot of the agent browser.', {}, async () => {
  const b64 = await call('screenshot')
  return { content: [{ type: 'image', data: b64, mimeType: 'image/png' }] }
})

server.tool(
  'browser_eval',
  'Evaluate a JavaScript expression in the page and return the JSON result.',
  { expression: z.string() },
  async ({ expression }) => text(await call('eval', { expression }))
)

server.tool(
  'browser_console',
  'Get recent console messages from the page.',
  { limit: z.number().optional() },
  async ({ limit }) => text(await call('console', { limit }))
)

server.tool(
  'browser_network',
  'Get recent network requests made by the page.',
  { limit: z.number().optional() },
  async ({ limit }) => text(await call('network', { limit }))
)

server.tool('browser_cookies', 'Get cookies for the current page.', {}, async () =>
  text(await call('cookies'))
)

server.tool('browser_storage', 'Get localStorage and sessionStorage for the page.', {}, async () =>
  text(await call('storage'))
)

server.tool(
  'browser_wait_for',
  'Wait until a CSS selector appears or text is present on the page.',
  { selector: z.string().optional(), text: z.string().optional(), timeoutMs: z.number().optional() },
  async (args) => text(await call('wait', args))
)

server.tool(
  'browser_upload',
  'Set files on a file input (by ref) for upload.',
  { ref: z.string(), paths: z.array(z.string()) },
  async ({ ref, paths }) => text(await call('upload', { ref, paths }))
)

await server.connect(new StdioServerTransport())
