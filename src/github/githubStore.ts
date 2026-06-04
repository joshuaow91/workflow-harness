import { useSyncExternalStore } from 'react'

// Selected repo (nameWithOwner, e.g. "blink-ai/blink_server") shared across the
// Issues and My PRs tabs so switching repos in one carries to the other.
let selected: string | null = null
const listeners = new Set<() => void>()

export const githubStore = {
  get: (): string | null => selected,
  set: (repo: string): void => {
    selected = repo
    for (const l of listeners) l()
  },
  subscribe: (l: () => void): (() => void) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }
}

export function useSelectedRepo(): string | null {
  return useSyncExternalStore(githubStore.subscribe, githubStore.get)
}
