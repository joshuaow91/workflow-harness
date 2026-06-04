import { useEffect, useSyncExternalStore } from 'react'
import type { AppSettings } from '@shared/types'

let value: AppSettings | null = null
let loaded = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export const settingsStore = {
  get: (): AppSettings | null => value,
  ensureLoaded(): void {
    if (loaded) return
    loaded = true
    void window.api.settings.get().then((s) => {
      value = s
      emit()
    })
  },
  async update(patch: Partial<AppSettings>): Promise<void> {
    value = await window.api.settings.set(patch)
    emit()
  },
  subscribe(l: () => void): () => void {
    listeners.add(l)
    return () => listeners.delete(l)
  }
}

export function useSettings(): AppSettings | null {
  const v = useSyncExternalStore(settingsStore.subscribe, settingsStore.get)
  useEffect(() => settingsStore.ensureLoaded(), [])
  return v
}

/** Default directory for new sessions, with a safe synchronous fallback. */
export function useDefaultSessionDir(): string {
  const s = useSettings()
  return s?.defaultSessionDir ?? window.api.system.homeDir
}
