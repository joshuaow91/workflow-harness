import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { themeStore, xtermTheme } from '../themes/themeStore'
import { registerTerminalFocus } from '../lib/terminalFocus'
import { KittyKeyboard } from './kittyKeyboard'

// Attaches to an already-running PTY (created by TerminalsTab) by id. Replays the
// session's recent output so re-mounting (layout change / restart) is seamless.
// Does NOT kill the PTY on unmount — only the owner (the tab) does that.
export function TerminalPane({ id, onExit }: { id: string; onExit?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      fontFamily: 'SFMono-Regular, Menlo, Monaco, monospace',
      fontSize: 12.5,
      lineHeight: 1.15,
      cursorBlink: true,
      allowProposedApi: true,
      theme: xtermTheme(themeStore.get()),
      scrollback: 50000
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon((_e, uri) => void window.api.system.openExternal(uri)))
    term.open(container)
    fit.fit()

    // xterm 5.x doesn't implement the kitty keyboard protocol, which claude turns on
    // at startup (and which is why modified keys like Shift+Enter work in Ghostty but
    // not here). This shim speaks it: kitty.scanOutput (below, in onData) tracks the
    // flags claude pushes and answers its query, and kitty.encode emits CSI-u for
    // modified keys while it's active — so Shift+Enter becomes CSI 13;2u (a real
    // newline) instead of a bare \r (submit). Plain Enter has no modifiers, so it
    // stays legacy \r and still submits.
    const kitty = new KittyKeyboard()
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      // preventDefault is essential: returning false stops xterm's keydown path, but
      // NOT its hidden textarea, which would otherwise insert a newline and emit its
      // own \r — that stray \r is what was submitting the message after our CSI-u.
      const seq = kitty.encode(e)
      if (seq) {
        e.preventDefault()
        window.api.terminal.write(id, seq)
        return false
      }
      // Non-kitty context (e.g. a raw shell): approximate Shift+Enter as Meta+Enter.
      if (e.key === 'Enter' && e.shiftKey && !kitty.active) {
        e.preventDefault()
        window.api.terminal.write(id, '\x1b\r')
        return false
      }
      return true
    })

    const offTheme = themeStore.subscribe(() => {
      term.options.theme = xtermTheme(themeStore.get())
    })

    // Queue live data until the history buffer is written, to keep order.
    let ready = false
    const queue: string[] = []
    const offData = window.api.terminal.onData((e) => {
      if (e.id !== id) return
      // Watch claude's output for kitty keyboard push/pop/query and answer the
      // query, so it activates CSI-u input (see the key handler above).
      const reply = kitty.scanOutput(e.data)
      if (reply) window.api.terminal.write(id, reply)
      if (ready) term.write(e.data)
      else queue.push(e.data)
    })
    const offExit = window.api.terminal.onExit((e) => {
      if (e.id === id) {
        term.write('\r\n\x1b[2m[process exited]\x1b[0m\r\n')
        onExit?.()
      }
    })
    term.onData((data) => window.api.terminal.write(id, data))

    let cancelled = false
    void window.api.terminal.getBuffer(id).then((buf) => {
      if (cancelled) return
      // Recover kitty state from a resumed session's replayed output (if the push
      // is still within the capped buffer). A fresh session gets it live via onData.
      if (buf) {
        const reply = kitty.scanOutput(buf)
        if (reply) window.api.terminal.write(id, reply)
        term.write(buf)
      }
      for (const d of queue) term.write(d)
      queue.length = 0
      ready = true
      // Replaying the captured bytes can't restore a full-screen TUI (claude uses
      // the alternate screen, and the buffer is capped), so a re-attach can land
      // blank. Force the program to repaint with a real size change (SIGWINCH).
      const c = term.cols
      if (c > 1) {
        window.api.terminal.resize(id, c - 1, term.rows)
        setTimeout(() => window.api.terminal.resize(id, c, term.rows), 40)
      } else {
        window.api.terminal.resize(id, c, term.rows)
      }
    })

    const doFit = (): void => {
      try {
        fit.fit()
        window.api.terminal.resize(id, term.cols, term.rows)
        // Force a repaint: xterm doesn't redraw when its container returns from
        // display:none at the same size (tab switch), leaving the pane blank.
        term.refresh(0, term.rows - 1)
      } catch {
        /* detached / not yet sized */
      }
    }
    const ro = new ResizeObserver(doFit)
    ro.observe(container)
    if (container.parentElement) ro.observe(container.parentElement)
    window.addEventListener('resize', doFit)
    // A couple of post-layout fits to catch mount-while-hidden / first paint.
    requestAnimationFrame(doFit)
    setTimeout(doFit, 60)

    const focus = (): void => term.focus()
    container.addEventListener('mousedown', focus)
    const unregisterFocus = registerTerminalFocus(id, focus)
    term.focus()

    return () => {
      cancelled = true
      unregisterFocus()
      container.removeEventListener('mousedown', focus)
      window.removeEventListener('resize', doFit)
      ro.disconnect()
      offTheme()
      offData()
      offExit()
      term.dispose()
    }
  }, [id])

  return <div className="term-host" ref={containerRef} />
}
