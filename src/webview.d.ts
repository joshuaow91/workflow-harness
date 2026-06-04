// Minimal typings for Electron's <webview> tag used by BrowserPane.
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

export interface WebviewElement extends HTMLElement {
  src: string
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  stop(): void
  loadURL(url: string): Promise<void>
  getURL(): string
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        partition?: string
      }
    }
  }
}
