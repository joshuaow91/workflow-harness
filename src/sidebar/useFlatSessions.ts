import { useMemo } from 'react'
import type { ClaudeSession } from '@shared/types'
import { useClaudeProjects } from './useClaudeProjects'

export interface FlatSession extends ClaudeSession {
  projectName: string
}

// All sessions across projects, flattened and sorted by recency — for the
// session pickers in the web workspace's terminal panes.
export function useFlatSessions(): FlatSession[] {
  const { projects } = useClaudeProjects()
  return useMemo(() => {
    const all: FlatSession[] = []
    for (const p of projects) {
      for (const s of p.sessions) all.push({ ...s, projectName: p.name })
    }
    return all.sort((a, b) => {
      const ta = Date.parse(a.lastActivityAt ?? a.startedAt ?? '') || 0
      const tb = Date.parse(b.lastActivityAt ?? b.startedAt ?? '') || 0
      return tb - ta
    })
  }, [projects])
}
