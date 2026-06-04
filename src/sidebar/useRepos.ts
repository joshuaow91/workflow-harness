import { useCallback, useEffect, useState } from 'react'
import type { Repo } from '@shared/types'

export function useRepos(): { repos: Repo[]; loading: boolean; refresh: () => void } {
  const [repos, setRepos] = useState<Repo[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    window.api.worktree
      .listRepos()
      .then(setRepos)
      .catch(() => setRepos([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { repos, loading, refresh }
}
