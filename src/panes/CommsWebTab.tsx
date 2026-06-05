import { WebFrame } from './WebFrame'

// Embedded Outlook/Teams web. Unread is reported by an injected hook that folds
// together the Badging API, page title, and a DOM scrape (best-effort).
export function CommsWebTab({ src, onUnread }: { src: string; onUnread?: (n: number) => void }) {
  return <WebFrame src={src} editableAddress={false} onBadge={onUnread} />
}
