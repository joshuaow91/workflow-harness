import { useEffect, useMemo, useState } from 'react'
import { useRepos } from '../sidebar/useRepos'
import { WebFrame } from '../panes/WebFrame'
import { Dropdown } from '../components/Dropdown'

const DEFAULT_REPO = 'blink-ai/blink_server'

export function IssuesTab() {
  const { repos } = useRepos()
  const ghRepos = useMemo(
    () => repos.filter((r) => r.nameWithOwner).map((r) => r.nameWithOwner as string),
    [repos]
  )
  const [repo, setRepo] = useState<string | null>(null)

  useEffect(() => {
    if (!repo && ghRepos.length > 0) setRepo(ghRepos.includes(DEFAULT_REPO) ? DEFAULT_REPO : ghRepos[0])
  }, [repo, ghRepos])

  const url = repo ? `https://github.com/${repo}/issues` : 'https://github.com'

  return (
    <div className="gh-tab">
      <div className="gh-header">
        <span className="gh-heading">Issues</span>
        <Dropdown
          value={repo ?? ''}
          options={ghRepos.map((r) => ({ value: r, label: r }))}
          onChange={setRepo}
          searchable
          minWidth={240}
          placeholder="Select repo…"
        />
      </div>
      <div className="gh-embed">
        <WebFrame src={url} editableAddress={false} />
      </div>
    </div>
  )
}
