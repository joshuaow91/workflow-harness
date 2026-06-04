export function normalizeInput(raw: string, fallback = 'https://github.com'): string {
  const text = raw.trim()
  if (!text) return fallback
  if (/^https?:\/\//i.test(text)) return text
  if (/^[^\s]+\.[^\s]+$/.test(text)) return `https://${text}`
  return `https://search.brave.com/search?q=${encodeURIComponent(text)}`
}
