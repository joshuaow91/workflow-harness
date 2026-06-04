import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { app } from 'electron'
import type { AppSettings } from '@shared/types'

function defaults(): AppSettings {
  const code = join(homedir(), 'Documents', 'Code')
  return {
    defaultSessionDir: existsSync(code) ? code : homedir(),
    themeName: 'Catppuccin Mocha',
    defaultBrowserUrl: 'https://github.com',
    sessionTitles: {},
    totpAccounts: [],
    ddApiKey: '',
    ddAppKey: '',
    ddSite: 'datadoghq.com',
    obsidianVault: ''
  }
}

function file(): string {
  return join(app.getPath('userData'), 'settings.json')
}

let cache: AppSettings | null = null

export function getSettings(): AppSettings {
  if (cache) return cache
  try {
    cache = { ...defaults(), ...(JSON.parse(readFileSync(file(), 'utf8')) as Partial<AppSettings>) }
  } catch {
    cache = defaults()
  }
  return cache
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  // Ignore a non-existent directory rather than persisting something unusable.
  if (patch.defaultSessionDir && !existsSync(patch.defaultSessionDir)) {
    next.defaultSessionDir = getSettings().defaultSessionDir
  }
  cache = next
  mkdirSync(dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(next, null, 2))
  return next
}
