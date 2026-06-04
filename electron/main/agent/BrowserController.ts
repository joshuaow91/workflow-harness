import { readFile } from 'fs/promises'
import { webContents, type WebContents } from 'electron'

// Drives the dedicated "agent" webview so Claude (via the MCP server) can browse,
// inspect, and interact with the page the way a person would.

let targetId: number | null = null
const consoleBuffer: { level: string; message: string; at: number }[] = []
const networkBuffer: { method: string; url: string; status?: number; at: number }[] = []
const attached = new Set<number>()

export function setAgentTarget(id: number | null): void {
  targetId = id
  if (id != null) attachListeners(id)
}

function target(): WebContents {
  if (targetId == null) throw new Error('No agent browser is open. Add the “agent” pane in the Browser workspace.')
  const wc = webContents.fromId(targetId)
  if (!wc || wc.isDestroyed()) throw new Error('Agent browser is not available.')
  return wc
}

function attachListeners(id: number): void {
  if (attached.has(id)) return
  const wc = webContents.fromId(id)
  if (!wc) return
  attached.add(id)

  wc.on('console-message', (_e, level, message) => {
    consoleBuffer.push({ level: String(level), message, at: Date.now() })
    if (consoleBuffer.length > 500) consoleBuffer.shift()
  })

  // Network log via CDP.
  try {
    wc.debugger.attach('1.3')
    wc.debugger.sendCommand('Network.enable')
    wc.debugger.on('message', (_e, method, params) => {
      if (method === 'Network.requestWillBeSent') {
        const p = params as { request: { method: string; url: string } }
        networkBuffer.push({ method: p.request.method, url: p.request.url, at: Date.now() })
        if (networkBuffer.length > 500) networkBuffer.shift()
      } else if (method === 'Network.responseReceived') {
        const p = params as { response: { url: string; status: number } }
        const e = [...networkBuffer].reverse().find((n) => n.url === p.response.url && n.status === undefined)
        if (e) e.status = p.response.status
      }
    })
  } catch {
    /* debugger may already be attached */
  }

  wc.once('destroyed', () => {
    attached.delete(id)
    if (targetId === id) targetId = null
  })
}

async function evalInPage<T>(expr: string): Promise<T> {
  return (await target().executeJavaScript(expr, true)) as T
}

// ---- snapshot: assign refs to interactive elements ----

const SNAPSHOT_SCRIPT = `(() => {
  const sel = 'a,button,input,textarea,select,[role=button],[role=link],[role=tab],[role=menuitem],[contenteditable=true],[onclick]';
  const els = Array.from(document.querySelectorAll(sel));
  let i = 0;
  const out = [];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    const ref = 'e' + (++i);
    el.setAttribute('data-agent-ref', ref);
    const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || el.getAttribute('title') || '').trim().slice(0, 120);
    out.push({
      ref,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      name,
      value: el.value !== undefined ? String(el.value).slice(0,120) : undefined,
      href: el.getAttribute('href') || undefined
    });
  }
  return { url: location.href, title: document.title, elements: out };
})()`

export async function snapshot(): Promise<unknown> {
  return evalInPage(SNAPSHOT_SCRIPT)
}

function findRefExpr(ref: string): string {
  return `document.querySelector('[data-agent-ref=${JSON.stringify(ref)}]')`
}

export async function navigate(url: string): Promise<{ url: string; title: string }> {
  const wc = target()
  await wc.loadURL(url)
  return { url: wc.getURL(), title: wc.getTitle() }
}

export async function click(ref: string): Promise<string> {
  const expr = `(() => { const el = ${findRefExpr(ref)}; if (!el) return 'not found'; el.scrollIntoView({block:'center'}); el.click(); return 'clicked'; })()`
  return evalInPage<string>(expr)
}

export async function type(ref: string, text: string, submit = false): Promise<string> {
  const expr = `(() => {
    const el = ${findRefExpr(ref)};
    if (!el) return 'not found';
    el.focus();
    const set = Object.getOwnPropertyDescriptor(el.__proto__, 'value');
    if (set && set.set) set.set.call(el, ${JSON.stringify(text)}); else el.value = ${JSON.stringify(text)};
    el.dispatchEvent(new Event('input', {bubbles:true}));
    el.dispatchEvent(new Event('change', {bubbles:true}));
    ${submit ? "if (el.form) el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit();" : ''}
    return 'typed';
  })()`
  return evalInPage<string>(expr)
}

export async function pressKey(key: string): Promise<string> {
  const wc = target()
  wc.focus()
  wc.sendInputEvent({ type: 'keyDown', keyCode: key })
  wc.sendInputEvent({ type: 'char', keyCode: key })
  wc.sendInputEvent({ type: 'keyUp', keyCode: key })
  return 'pressed ' + key
}

export async function screenshot(): Promise<string> {
  const image = await target().capturePage()
  return image.toPNG().toString('base64')
}

export async function evaluate(expression: string): Promise<unknown> {
  const result = await evalInPage<unknown>(`(() => { try { return JSON.stringify(${expression}); } catch (e) { return 'ERror: ' + e.message; } })()`)
  try {
    return JSON.parse(result as string)
  } catch {
    return result
  }
}

export function getConsole(limit = 50): typeof consoleBuffer {
  return consoleBuffer.slice(-limit)
}

export function getNetwork(limit = 50): typeof networkBuffer {
  return networkBuffer.slice(-limit)
}

export async function getCookies(): Promise<unknown> {
  const wc = target()
  return wc.session.cookies.get({ url: wc.getURL() })
}

export async function getStorage(): Promise<unknown> {
  return evalInPage(`({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage))
  })`)
}

export async function waitFor(opts: { selector?: string; text?: string; timeoutMs?: number }): Promise<string> {
  const deadline = Date.now() + (opts.timeoutMs ?? 8000)
  const check = opts.selector
    ? `!!document.querySelector(${JSON.stringify(opts.selector)})`
    : `document.body && document.body.innerText.includes(${JSON.stringify(opts.text ?? '')})`
  while (Date.now() < deadline) {
    if (await evalInPage<boolean>(`(() => { try { return ${check}; } catch { return false; } })()`)) return 'found'
    await new Promise((r) => setTimeout(r, 250))
  }
  return 'timeout'
}

export async function uploadFile(ref: string, paths: string[]): Promise<string> {
  const wc = target()
  // Resolve the backend node id for the file input and set files via CDP.
  const obj = await evalInPage<{ value: string }>(
    `(() => { const el = ${findRefExpr(ref)}; if(!el) return {value:'not found'}; el.scrollIntoView(); return {value:'ok'}; })()`
  )
  if (obj.value !== 'ok') return 'not found'
  // Read files to ensure they exist; CDP setFileInputFiles takes absolute paths.
  for (const p of paths) await readFile(p).catch(() => {
    throw new Error('Cannot read file: ' + p)
  })
  try {
    const doc = (await wc.debugger.sendCommand('DOM.getDocument')) as { root: { nodeId: number } }
    const node = (await wc.debugger.sendCommand('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: `[data-agent-ref="${ref}"]`
    })) as { nodeId: number }
    await wc.debugger.sendCommand('DOM.setFileInputFiles', { files: paths, nodeId: node.nodeId })
    return 'uploaded'
  } catch (e) {
    return 'error: ' + (e as Error).message
  }
}

export function agentReady(): boolean {
  return targetId != null
}
