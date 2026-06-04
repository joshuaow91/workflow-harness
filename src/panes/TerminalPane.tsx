import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { themeStore, xtermTheme } from '../themes/themeStore'

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
      scrollback: 10000
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon((_e, uri) => void window.api.system.openExternal(uri)))
    term.open(container)
    fit.fit()

    const offTheme = themeStore.subscribe(() => {
      term.options.theme = xtermTheme(themeStore.get())
    })

    // Queue live data until the history buffer is written, to keep order.
    let ready = false
    const queue: string[] = []
    const offData = window.api.terminal.onData((e) => {
      if (e.id !== id) return
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
      if (buf) term.write(buf)
      for (const d of queue) term.write(d)
      queue.length = 0
      ready = true
      window.api.terminal.resize(id, term.cols, term.rows)
    })

    const doFit = (): void => {
      try {
        fit.fit()
      } catch {
        /* detached */
      }
      window.api.terminal.resize(id, term.cols, term.rows)
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
    term.focus()

    return () => {
      cancelled = true
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
