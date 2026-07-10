import { useEffect, useState } from 'react'
import type { DevService, DevStackEntry } from '@shared/types'

// Dev-stack config + live state (which worktree currently owns each repo's
// canonical port). Pushed from main on every start/stop/exit, so badges stay live.
export function useDevStack(): {
  services: DevService[]
  state: DevStackEntry[]
  serviceFor: (repo: string) => DevService | undefined
  activeFor: (repo: string) => DevStackEntry | undefined
} {
  const [services, setServices] = useState<DevService[]>([])
  const [state, setState] = useState<DevStackEntry[]>([])

  useEffect(() => {
    void window.api.devstack.services().then(setServices)
    void window.api.devstack.state().then(setState)
    return window.api.devstack.onStatus(setState)
  }, [])

  return {
    services,
    state,
    serviceFor: (repo) => services.find((s) => s.repo === repo),
    activeFor: (repo) => state.find((e) => e.repo === repo && e.running)
  }
}
