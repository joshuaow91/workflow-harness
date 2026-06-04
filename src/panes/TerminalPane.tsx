import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import type { TerminalSpawnOptions } from '@shared/types'
import { themeStore, xtermTheme } from '../themes/themeStore'

export function TerminalPane({ opts, onExit }: { opts: TerminalSpawnOptions; onExit?: () => void }) {
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

    // Live-update the terminal palette when the theme changes.
    const offTheme = themeStore.subscribe(() => {
      term.options.theme = xtermTheme(themeStore.get())
    })

    term.open(container)
    fit.fit()

    const idRef = { current: null as string | null }

    const offData = window.api.terminal.onData((e) => {
      if (e.id === idRef.current) term.write(e.data)
    })
    const offExit = window.api.terminal.onExit((e) => {
      if (e.id === idRef.current) {
        term.write('\r\n\x1b[2m[process exited]\x1b[0m\r\n')
        onExit?.()
      }
    })

    term.onData((data) => {
      if (idRef.current) window.api.terminal.write(idRef.current, data)
    })

    window.api.terminal
      .create({ ...opts, cols: term.cols, rows: term.rows })
      .then((id) => {
        idRef.current = id
      })
      .catch(() => term.write('\r\n\x1b[31mFailed to start terminal.\x1b[0m\r\n'))

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* container detached */
      }
      if (idRef.current) window.api.terminal.resize(idRef.current, term.cols, term.rows)
    })
    ro.observe(container)

    // Focus on click anywhere in the pane.
    const focus = (): void => term.focus()
    container.addEventListener('mousedown', focus)
    term.focus()

    return () => {
      container.removeEventListener('mousedown', focus)
      ro.disconnect()
      offTheme()
      offData()
      offExit()
      if (idRef.current) window.api.terminal.kill(idRef.current)
      term.dispose()
    }
    // opts is captured once at mount; panes are remounted via React key to "restart".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div className="term-host" ref={containerRef} />
}
