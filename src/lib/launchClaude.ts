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

/** Build the active agent's launch command, injecting the repo map when enabled. */
export function claudeCommand(resumeId?: string): Promise<string> {
  const inject = settingsStore.get()?.injectRepoMap !== false
  const mapFile = inject && mapInfo.available && mapInfo.path ? mapInfo.path : undefined
  return window.api.agent.command({ resumeId, mapFile })
}

export async function launchClaude(opts: {
  cwd: string
  label?: string
  resumeId?: string
}): Promise<void> {
  terminalBus.open({
    cwd: opts.cwd,
    label: opts.label,
    initialCommand: await claudeCommand(opts.resumeId)
  })
}
