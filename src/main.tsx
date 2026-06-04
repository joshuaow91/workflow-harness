import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppShell } from './app/AppShell'
import { TotpPopout } from './settings/TotpPopout'
import './styles.css'

// The same renderer bundle serves the floating authenticator window (#totp).
const isTotp = window.location.hash === '#totp'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{isTotp ? <TotpPopout /> : <AppShell />}</React.StrictMode>
)
