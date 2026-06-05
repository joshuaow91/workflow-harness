import { CommsWebTab } from './CommsWebTab'

// Embedded Microsoft Teams on Web. Persistent so it keeps its websocket/service
// worker alive for real-time channel + chat push notifications.
export function TeamsTab({ onUnread }: { onUnread?: (n: number) => void }) {
  return <CommsWebTab src="https://teams.microsoft.com/" onUnread={onUnread} />
}
