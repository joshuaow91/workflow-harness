import type { HarnessApi } from '../electron/preload'

declare global {
  interface Window {
    api: HarnessApi
  }

  // Custom elements from electron-chrome-extensions (the extension action toolbar).
  namespace JSX {
    interface IntrinsicElements {
      'browser-action-list': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          partition?: string
          tab?: number
          alignment?: string
        },
        HTMLElement
      >
    }
  }
}

export {}
