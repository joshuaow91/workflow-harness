import { WebFrame } from './WebFrame'

// Embedded Outlook on Web. Stays mounted (persistent layer) so its service
// worker keeps delivering real push notifications as native OS notifications.
export function OutlookTab() {
  return <WebFrame src="https://outlook.office.com/mail/" editableAddress={false} />
}
