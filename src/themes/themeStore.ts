import { useSyncExternalStore } from 'react'
import type { ITheme } from '@xterm/xterm'
import rawThemes from './ghostty-themes.json'

export interface Theme {
  name: string
  bg: string
  fg: string
  cursor: string
  selection: string
  palette: string[] // 16 ANSI colors
}

export const THEMES = rawThemes as Theme[]
const byName = new Map(THEMES.map((t) => [t.name, t]))

export const DEFAULT_THEME = 'Catppuccin Mocha'

// ---- color helpers ----

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function rgbToHex(rgb: number[]): string {
  return '#' + rgb.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')
}
function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  return rgbToHex(A.map((x, i) => x + (B[i] - x) * t))
}
function luminance(h: string): number {
  const [r, g, b] = hexToRgb(h).map((x) => x / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** A theme is "dark" when its background is darker than mid-grey. */
export function isDarkTheme(t: Theme): boolean {
  return luminance(t.bg) < 0.5
}

/** The first theme of the opposite appearance, preferring a named pair. */
export function counterpartTheme(t: Theme, prefer?: string): Theme {
  const wantDark = !isDarkTheme(t)
  const preferred = prefer ? byName.get(prefer) : undefined
  if (preferred && isDarkTheme(preferred) === wantDark) return preferred
  return THEMES.find((x) => isDarkTheme(x) === wantDark) ?? t
}

// Map a Ghostty palette onto the app's CSS variables, coherently for light/dark.
function applyCssVars(t: Theme): void {
  const dark = luminance(t.bg) < 0.5
  const edge = dark ? '#000000' : '#ffffff'
  const deep = (amt: number): string => mix(t.bg, edge, amt)
  const r = document.documentElement.style
  const set = (k: string, v: string): void => r.setProperty(k, v)

  set('--bg', t.bg)
  set('--bg-alt', deep(0.12))
  set('--bg-elevated', deep(0.28))
  set('--surface', mix(t.bg, t.fg, 0.1))
  set('--surface-hover', mix(t.bg, t.fg, 0.18))
  set('--overlay', mix(t.bg, t.fg, 0.42))
  set('--border', mix(t.bg, t.fg, 0.14))
  set('--text', t.fg)
  set('--text-dim', mix(t.fg, t.bg, 0.22))
  set('--text-faint', mix(t.fg, t.bg, 0.45))
  set('--accent', t.palette[4])
  set('--accent-dim', t.palette[6])
  set('--green', t.palette[2])
  set('--yellow', t.palette[3])
  set('--red', t.palette[1])
  set('--mauve', t.palette[5])
}

export function xtermTheme(t: Theme): ITheme {
  const p = t.palette
  return {
    background: t.bg,
    foreground: t.fg,
    cursor: t.cursor,
    cursorAccent: t.bg,
    selectionBackground: t.selection,
    black: p[0],
    red: p[1],
    green: p[2],
    yellow: p[3],
    blue: p[4],
    magenta: p[5],
    cyan: p[6],
    white: p[7],
    brightBlack: p[8],
    brightRed: p[9],
    brightGreen: p[10],
    brightYellow: p[11],
    brightBlue: p[12],
    brightMagenta: p[13],
    brightCyan: p[14],
    brightWhite: p[15]
  }
}

// ---- store ----

let current: Theme = byName.get(DEFAULT_THEME) ?? THEMES[0]
const listeners = new Set<() => void>()

export const themeStore = {
  get: (): Theme => current,
  apply(name: string): void {
    const t = byName.get(name)
    if (!t) return
    current = t
    applyCssVars(t)
    for (const l of listeners) l()
  },
  subscribe(l: () => void): () => void {
    listeners.add(l)
    return () => listeners.delete(l)
  }
}

export function useTheme(): Theme {
  return useSyncExternalStore(themeStore.subscribe, themeStore.get)
}
