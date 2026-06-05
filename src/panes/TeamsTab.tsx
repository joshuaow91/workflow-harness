import { WebFrame } from './WebFrame'

// Embedded Microsoft Teams on Web. Persistent so it keeps its websocket/service
// worker alive for real-time channel + chat push notifications.
export function TeamsTab() {
  return <WebFrame src="https://teams.microsoft.com/" editableAddress={false} />
}
