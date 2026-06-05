import { WebFrame } from './WebFrame'

function unreadFromTitle(title: string): number {
  const m = title.match(/\((\d+)\+?\)/)
  return m ? Number(m[1]) : 0
}

// Embedded Microsoft Teams on Web. Persistent so it keeps its websocket/service
// worker alive for real-time channel + chat push notifications.
export function TeamsTab({ onUnread }: { onUnread?: (n: number) => void }) {
  return (
    <WebFrame
      src="https://teams.microsoft.com/"
      editableAddress={false}
      onTitle={(t) => onUnread?.(unreadFromTitle(t))}
    />
  )
}
