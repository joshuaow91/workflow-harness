import { useState } from 'react'
import { Icon } from '../components/Icon'
import type { TotpAccount } from '@shared/types'
import { settingsStore, useSettings } from '../lib/settingsStore'
import { parseOtp } from '../lib/totp'
import { TotpRow } from './TotpRow'

export function TotpSection() {
  const settings = useSettings()
  const accounts = settings?.totpAccounts ?? []
  const [draft, setDraft] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  const add = (): void => {
    const parsed = parseOtp(draft)
    if (!parsed) {
      setError('Paste an otpauth:// URI or a base32 secret.')
      return
    }
    const account: TotpAccount = {
      id: crypto.randomUUID(),
      label: label.trim() || parsed.label || 'GitHub',
      secret: parsed.secret
    }
    void settingsStore.update({ totpAccounts: [...accounts, account] })
    setDraft('')
    setLabel('')
    setError(null)
  }

  const remove = (id: string): void => {
    void settingsStore.update({ totpAccounts: accounts.filter((a) => a.id !== id) })
  }

  return (
    <section className="settings-section">
      <div className="settings-row" style={{ marginBottom: 10 }}>
        <div className="settings-label" style={{ margin: 0 }}>
          Authenticator (TOTP) — for GitHub 2FA inside the app
        </div>
        {accounts.length > 0 && (
          <button
            className="tbtn"
            style={{ marginLeft: 'auto' }}
            onClick={() => void window.api.system.openTotpWindow()}
            title="Open a floating always-on-top window with your codes"
          >
            <Icon name="diff" size={13} /> Open in window
          </button>
        )}
      </div>

      {accounts.length > 0 && (
        <div className="totp-list">
          {accounts.map((a) => (
            <TotpRow key={a.id} account={a} onRemove={() => remove(a.id)} />
          ))}
        </div>
      )}

      <div className="totp-add">
        <input
          className="settings-input"
          placeholder="Label (e.g. GitHub)"
          style={{ maxWidth: 160 }}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          className="settings-input"
          placeholder="Paste otpauth:// URI or base32 secret"
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="tbtn" onClick={add}>
          Add
        </button>
      </div>
      {error && <p className="settings-hint" style={{ color: 'var(--red)' }}>{error}</p>}

      <p className="settings-hint">
        On github.com (in a browser where your passkey works) go to{' '}
        <strong>Settings → Password and authentication → Authenticator app</strong>, choose
        “enter the setup key,” and paste that key (or the full <code>otpauth://</code> URI) here.
        Keep your passkey too — this just adds a second method. Then the embedded GitHub login is:
        password → the 6-digit code above. Secrets are stored locally in plaintext on this machine.
      </p>
    </section>
  )
}
