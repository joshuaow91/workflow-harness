import { useEffect, useState } from 'react'
import type { TotpAccount } from '@shared/types'
import { settingsStore, useSettings } from '../lib/settingsStore'
import { generateTotp, parseOtp, totpRemaining } from '../lib/totp'

function TotpRow({ account, onRemove }: { account: TotpAccount; onRemove: () => void }) {
  const [code, setCode] = useState('------')
  const [remaining, setRemaining] = useState(30)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    const tick = async (): Promise<void> => {
      setRemaining(totpRemaining())
      const c = await generateTotp(account.secret)
      if (active) setCode(c)
    }
    void tick()
    const iv = setInterval(() => void tick(), 1000)
    return () => {
      active = false
      clearInterval(iv)
    }
  }, [account.secret])

  const copy = (): void => {
    void navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="totp-row">
      <span className="totp-label">{account.label || 'TOTP'}</span>
      <button className="totp-code" onClick={copy} title="Copy code">
        {code.slice(0, 3)} {code.slice(3)}
      </button>
      <span className="totp-remaining" title="Seconds until refresh">
        {remaining}s
      </span>
      {copied && <span className="totp-copied">copied</span>}
      <button className="term-act" title="Remove" onClick={onRemove}>
        ✕
      </button>
    </div>
  )
}

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
      <div className="settings-label">Authenticator (TOTP) — for GitHub 2FA inside the app</div>

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
