import { WebFrame } from './WebFrame'

function unreadFromTitle(title: string): number {
  const m = title.match(/\((\d+)\+?\)/)
  return m ? Number(m[1]) : 0
}

// Embedded Outlook on Web. Stays mounted (persistent layer) so its service
// worker keeps delivering real push notifications as native OS notifications.
export function OutlookTab({ onUnread }: { onUnread?: (n: number) => void }) {
  return (
    <WebFrame
      src="https://outlook.office.com/mail/"
      editableAddress={false}
      onTitle={(t) => onUnread?.(unreadFromTitle(t))}
    />
  )
}
