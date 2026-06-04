import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import type { TerminalSpawnOptions } from '@shared/types'

const THEME = {
  background: '#11111b',
  foreground: '#cdd6f4',
  cursor: '#f5e0dc',
  selectionBackground: '#45475a',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#cba6f7',
  cyan: '#94e2d5',
  white: '#bac2de',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#cba6f7',
  brightCyan: '#94e2d5',
  brightWhite: '#a6adc8'
}

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
      theme: THEME,
      scrollback: 10000
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon((_e, uri) => void window.api.system.openExternal(uri)))

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
