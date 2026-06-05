import { getSettings } from '../settings/SettingsStore'
import { claudeProvider } from './claudeProvider'
import { codexProvider } from './codexProvider'
import type { AgentProvider } from './types'

export const providers: AgentProvider[] = [claudeProvider, codexProvider]

export function activeProvider(): AgentProvider {
  const id = getSettings().agent
  return providers.find((p) => p.id === id) ?? claudeProvider
}
