// RFC 6238 TOTP using Web Crypto (HMAC-SHA1).

function base32Decode(input: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase()
  const out = new Uint8Array(Math.floor((clean.length * 5) / 8))
  let bits = 0
  let value = 0
  let index = 0
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out[index++] = (value >>> (bits - 8)) & 0xff
      bits -= 8
    }
  }
  return out.slice(0, index)
}

const PERIOD = 30

export async function generateTotp(secretB32: string, now = Date.now()): Promise<string> {
  const key = base32Decode(secretB32)
  if (key.length === 0) return '------'
  let counter = Math.floor(now / 1000 / PERIOD)
  const msg = new Uint8Array(8)
  for (let i = 7; i >= 0; i--) {
    msg[i] = counter & 0xff
    counter = Math.floor(counter / 256)
  }
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const hmac = new Uint8Array(
    await crypto.subtle.sign('HMAC', cryptoKey, msg as unknown as BufferSource)
  )
  const offset = hmac[hmac.length - 1] & 0x0f
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3]
  return (bin % 1_000_000).toString().padStart(6, '0')
}

export function totpRemaining(now = Date.now()): number {
  return PERIOD - (Math.floor(now / 1000) % PERIOD)
}

/** Parse an otpauth:// URI or a bare base32 secret. */
export function parseOtp(input: string): { label: string; secret: string } | null {
  const text = input.trim()
  if (/^otpauth:\/\//i.test(text)) {
    try {
      const u = new URL(text)
      const secret = u.searchParams.get('secret')
      if (!secret) return null
      const issuer = u.searchParams.get('issuer') || ''
      const path = decodeURIComponent(u.pathname.replace(/^\/+(totp\/)?/i, ''))
      return { label: issuer || path || 'TOTP', secret: secret.replace(/\s+/g, '').toUpperCase() }
    } catch {
      return null
    }
  }
  const clean = text.replace(/\s+/g, '').toUpperCase()
  if (/^[A-Z2-7]+=*$/.test(clean) && clean.length >= 8) return { label: '', secret: clean }
  return null
}
