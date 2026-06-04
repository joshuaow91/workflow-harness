import { WebFrame } from '../panes/WebFrame'

// The user's assigned project board view (org Projects v2), embedded.
const BOARD_URL = 'https://github.com/orgs/blink-ai/projects/6/views/21?filterQuery=josh'

export function BoardTab() {
  return (
    <div className="gh-tab">
      <div className="gh-embed">
        <WebFrame src={BOARD_URL} editableAddress={false} />
      </div>
    </div>
  )
}
