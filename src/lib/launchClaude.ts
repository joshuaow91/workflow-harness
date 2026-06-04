import { terminalBus } from './terminalBus'
import { settingsStore } from './settingsStore'

// Cached repo-map availability/path; refreshed on load and after (re)generation.
let mapInfo: { path: string; available: boolean } = { path: '', available: false }

export function refreshMapInfo(): void {
  void window.api.knowledge.mapInfo().then((i) => {
    mapInfo = i
  })
}
refreshMapInfo()

/** Build the claude command, injecting the repo map when enabled + available. */
export function claudeCommand(resumeId?: string): string {
  const base = resumeId ? `claude --resume ${resumeId}` : 'claude'
  const inject = settingsStore.get()?.injectRepoMap !== false
  if (inject && mapInfo.available && mapInfo.path) {
    return `${base} --append-system-prompt-file '${mapInfo.path}'`
  }
  return base
}

export function launchClaude(opts: { cwd: string; label?: string; resumeId?: string }): void {
  terminalBus.open({
    cwd: opts.cwd,
    label: opts.label,
    initialCommand: claudeCommand(opts.resumeId)
  })
}
