import { useEffect } from 'react'
import { useSettings } from '../lib/settingsStore'
import { themeStore } from '../themes/themeStore'
import { TotpRow } from './TotpRow'

// Rendered as the sole content of the floating always-on-top authenticator window.
export function TotpPopout() {
  const settings = useSettings()
  const accounts = settings?.totpAccounts ?? []

  useEffect(() => {
    if (settings?.themeName) themeStore.apply(settings.themeName)
  }, [settings?.themeName])

  return (
    <div className="totp-popout">
      <div className="totp-popout-title">Authenticator</div>
      {accounts.length === 0 ? (
        <div className="side-term-hint">
          No accounts yet. Add one in Settings → Authenticator.
        </div>
      ) : (
        accounts.map((a) => <TotpRow key={a.id} account={a} />)
      )}
      <div className="totp-popout-hint">Click a code to copy. Stays on top while you sign in.</div>
    </div>
  )
}
