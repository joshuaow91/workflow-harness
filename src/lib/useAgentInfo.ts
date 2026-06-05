import { useEffect, useState } from 'react'
import type { AgentInfo } from '@shared/types'
import { useSettings } from './settingsStore'

const DEFAULT: AgentInfo = { id: 'claude', label: 'Claude Code', cli: 'claude' }

// The active agent's id/label/cli, re-fetched when the agent setting changes.
export function useAgentInfo(): AgentInfo {
  const settings = useSettings()
  const [info, setInfo] = useState<AgentInfo>(DEFAULT)
  useEffect(() => {
    void window.api.agent.info().then(setInfo)
  }, [settings?.agent])
  return info
}
