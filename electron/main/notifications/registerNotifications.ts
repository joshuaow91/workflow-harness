import { execFile } from 'child_process'
import { promisify } from 'util'
import { BrowserWindow, ipcMain, Notification } from 'electron'
import { IPC } from '@shared/ipc'
import { getSettings } from '../settings/SettingsStore'
import { listMyPRsAll, listReviewPRs } from '../github/GitHubService'

const pexec = promisify(execFile)
let getWin: () => BrowserWindow | null = () => null

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body })
  n.on('click', () => {
    const w = getWin()
    w?.show()
    w?.focus()
  })
  n.show()
}

const seenReview = new Set<string>()
let firstReview = true
const myOpen = new Map<string, { number: number; repo: string; title: string }>()
let firstMine = true

async function poll(): Promise<void> {
  const s = getSettings()

  if (s.notifyPrReview) {
    try {
      const prs = await listReviewPRs()
      for (const pr of prs) {
        if (!seenReview.has(pr.url)) {
          seenReview.add(pr.url)
          if (!firstReview) notify('Review requested', `#${pr.number} · ${pr.title}`)
        }
      }
      firstReview = false
    } catch {
      /* gh unavailable */
    }
  }

  if (s.notifyPrMerged) {
    try {
      const prs = await listMyPRsAll()
      const cur = new Set(prs.map((p) => p.url))
      for (const [url, info] of [...myOpen]) {
        if (!cur.has(url)) {
          try {
            const { stdout } = await pexec('gh', ['pr', 'view', String(info.number), '-R', info.repo, '--json', 'state'])
            if (JSON.parse(stdout).state === 'MERGED' && !firstMine) notify('PR merged', `#${info.number} · ${info.title}`)
          } catch {
            /* ignore */
          }
          myOpen.delete(url)
        }
      }
      for (const p of prs) if (!myOpen.has(p.url)) myOpen.set(p.url, { number: p.number, repo: p.repo, title: p.title })
      firstMine = false
    } catch {
      /* ignore */
    }
  }
}

export function registerNotifications(getWindow: () => BrowserWindow | null): void {
  getWin = getWindow
  ipcMain.handle(IPC.system.notify, (_e, title: string, body: string) => notify(title, body))
  setTimeout(() => void poll(), 8000) // initial: seed "seen" sets without spamming
  setInterval(() => void poll(), 3 * 60 * 1000)
}
