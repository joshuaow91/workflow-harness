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
    // The devstack bridge lives in the preload, which only loads on a harness
    // restart. Until then window.api.devstack is undefined — guard so the sidebar
    // doesn't crash to a blank screen; the controls simply stay hidden.
    const ds = window.api.devstack
    if (!ds) return
    void ds.services().then(setServices)
    void ds.state().then(setState)
    return ds.onStatus(setState)
  }, [])

  return {
    services,
    state,
    serviceFor: (repo) => services.find((s) => s.repo === repo),
    activeFor: (repo) => state.find((e) => e.repo === repo && e.running)
  }
}
