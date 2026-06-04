import { useEffect, useState } from 'react'
import type { ClaudeProject } from '@shared/types'

interface State {
  projects: ClaudeProject[]
  loading: boolean
}

// Loads the Claude project/session tree and keeps it live: the main process
// pushes a fresh snapshot over IPC whenever ~/.claude changes (chokidar).
export function useClaudeProjects(): State {
  const [projects, setProjects] = useState<ClaudeProject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

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
  }, [])

  return { projects, loading }
}
