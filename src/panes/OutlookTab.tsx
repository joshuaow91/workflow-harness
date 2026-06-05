import { CommsWebTab } from './CommsWebTab'

// Embedded Outlook on Web. Persistent so its service worker keeps delivering
// real push notifications as native OS notifications.
export function OutlookTab({ onUnread }: { onUnread?: (n: number) => void }) {
  return <CommsWebTab src="https://outlook.office.com/mail/" onUnread={onUnread} />
}
