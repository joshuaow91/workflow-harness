import type { HarnessApi } from '../electron/preload'

declare global {
  interface Window {
    api: HarnessApi
  }
}

export {}
