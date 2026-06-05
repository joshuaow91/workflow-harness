import { useEffect, useState } from 'react'
import type { ClaudeProject } from '@shared/types'
import { useSettings } from '../lib/settingsStore'

interface State {
  projects: ClaudeProject[]
  loading: boolean
}

// Loads the active agent's project/session tree and keeps it live: the main
// process pushes a fresh snapshot over IPC whenever the agent's data changes.
export function useClaudeProjects(): State {
  const settings = useSettings()
  const agent = settings?.agent ?? 'claude'
  const [projects, setProjects] = useState<ClaudeProject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)

    window.api.claude
      .getProjects()
      .then((p) => {
        if (active) {
          setProjects(p)
          setLoading(false)
        }
      })
      .catch(() => active && setLoading(false))

    const unsubscribe = window.api.claude.onSidebarUpdate((p) => {
      if (active) setProjects(p)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [agent])

  return { projects, loading }
}
