import { TabbedWebView } from '../components/TabbedWebView'

// The user's assigned project board view (org Projects v2), embedded.
const BOARD_URL = 'https://github.com/orgs/blink-ai/projects/6/views/21?filterQuery=josh'

export function BoardTab() {
  return <TabbedWebView homeUrl={BOARD_URL} homeLabel="Board" />
}
