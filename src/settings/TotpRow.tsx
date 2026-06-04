import { useEffect, useState } from 'react'
import type { TotpAccount } from '@shared/types'
import { generateTotp, totpRemaining } from '../lib/totp'

export function TotpRow({
  account,
  onRemove
}: {
  account: TotpAccount
  onRemove?: () => void
}) {
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
      {onRemove && (
        <button className="term-act" title="Remove" onClick={onRemove}>
          ✕
        </button>
      )}
    </div>
  )
}
