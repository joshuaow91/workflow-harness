import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppShell } from './app/AppShell'
import { TotpPopout } from './settings/TotpPopout'
import './styles.css'

// The same renderer bundle serves the floating authenticator window (#totp).
// (The <browser-action-list> custom element is registered from the preload via
// injectBrowserAction — it needs preload-context APIs, not the renderer.)
const isTotp = window.location.hash === '#totp'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{isTotp ? <TotpPopout /> : <AppShell />}</React.StrictMode>
)
