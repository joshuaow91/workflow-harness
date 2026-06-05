import { useRef } from 'react'
import { WebFrame } from './WebFrame'

function titleCount(t: string): number {
  const m = t.match(/\((\d+)\+?\)/)
  return m ? Number(m[1]) : 0
}

// Embedded Outlook/Teams web. Reports unread via the Badging API (primary,
// what these PWAs actually use) with the page-title count as a fallback.
export function CommsWebTab({ src, onUnread }: { src: string; onUnread?: (n: number) => void }) {
  const badge = useRef(0)
  const title = useRef(0)
  const gotBadge = useRef(false)
  const emit = (): void => onUnread?.(gotBadge.current ? badge.current : title.current)

  return (
    <WebFrame
      src={src}
      editableAddress={false}
      onBadge={(n) => {
        gotBadge.current = true
        badge.current = n
        emit()
      }}
      onTitle={(t) => {
        title.current = titleCount(t)
        if (!gotBadge.current) emit()
      }}
    />
  )
}
