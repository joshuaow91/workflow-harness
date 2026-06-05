import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { BrowserHistoryEntry } from '@shared/types'

let hist: BrowserHistoryEntry[] | null = null

function file(): string {
  return join(app.getPath('userData'), 'browser-history.json')
}
function load(): BrowserHistoryEntry[] {
  if (hist) return hist
  try {
    hist = JSON.parse(readFileSync(file(), 'utf8')) as BrowserHistoryEntry[]
  } catch {
    hist = []
  }
  return hist
}
let saveTimer: NodeJS.Timeout | null = null
function save(): void {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      writeFileSync(file(), JSON.stringify(load().slice(0, 3000)))
    } catch {
      /* ignore */
    }
  }, 1000)
}

export function recordVisit(url: string, title: string): void {
  if (!url || url === 'about:blank' || url.startsWith('chrome') || url.startsWith('devtools')) return
  const h = load()
  const e = h.find((x) => x.url === url)
  if (e) {
    e.visits++
    e.last = Date.now()
    if (title) e.title = title
  } else {
    h.push({ url, title: title || url, visits: 1, last: Date.now() })
  }
  save()
}

export function suggest(query: string, limit = 8): BrowserHistoryEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return load()
    .filter((e) => e.url.toLowerCase().includes(q) || e.title.toLowerCase().includes(q))
    .sort((a, b) => b.visits - a.visits || b.last - a.last)
    .slice(0, limit)
}
