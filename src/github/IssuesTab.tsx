import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import type { GhIssue } from '@shared/types'
import { useAsync } from '../lib/useAsync'
import { useRepos } from '../sidebar/useRepos'
import { useDefaultSessionDir } from '../lib/settingsStore'
import { terminalBus } from '../lib/terminalBus'
import { relativeTime } from '../lib/time'
import { Dropdown } from '../components/Dropdown'
import { Icon } from '../components/Icon'
import { GhState } from './GhShared'

const DEFAULT_REPO = 'blink-ai/blink_server'

function labelStyle(hex: string): React.CSSProperties {
  const c = (hex || '888888').replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return { backgroundColor: `#${c}`, color: lum > 0.6 ? '#1b1b1f' : '#ffffff' }
}

function md(src: string): string {
  return marked.parse(src || '_No description provided._', { gfm: true, async: false }) as string
}

function IssueRow({ issue, onOpen }: { issue: GhIssue; onOpen: (i: GhIssue) => void }) {
  return (
    <div className="issue-row" onClick={() => onOpen(issue)}>
      <span className={`issue-ico ${issue.state.toLowerCase()}`}>
        <Icon name="issue" size={15} />
      </span>
      <div className="issue-row-main">
        <div className="issue-row-title">
          <span className="issue-row-titletext">{issue.title}</span>
          {issue.labels.map((l) => (
            <span key={l.name} className="issue-label" style={labelStyle(l.color)}>
              {l.name}
            </span>
          ))}
        </div>
        <div className="issue-row-sub">
          #{issue.number} · updated {relativeTime(issue.updatedAt)}
          {issue.assignees.length > 0 && ` · ${issue.assignees.join(', ')}`}
        </div>
      </div>
    </div>
  )
}

function IssueDetailView({
  repo,
  number,
  onSendClaude
}: {
  repo: string
  number: number
  onSendClaude: () => void
}) {
  const { data, loading, error, reload } = useAsync(
    () => window.api.github.issueDetail(repo, number),
    [repo, number]
  )
  if (loading) return <div className="gh-state">Loading issue…</div>
  if (error) return <div className="gh-state gh-error">{error}</div>
  if (!data) return null

  return (
    <div className="issue-detail">
      <div className="issue-detail-head">
        <span className={`issue-state ${data.state.toLowerCase()}`}>
          <Icon name="issue" size={13} /> {data.state.toLowerCase()}
        </span>
        <span className="issue-detail-num">{repo} #{data.number}</span>
        <div className="issue-detail-actions">
          <button className="tbtn primary" onClick={onSendClaude} title="Open a Claude plan-mode session on this issue">
            ✦ Investigate &amp; plan
          </button>
          <button className="tbtn" onClick={() => void window.api.system.openExternal(data.url)}>
            Open ↗
          </button>
          <button className="term-act" onClick={reload} title="Refresh">
            ↻
          </button>
        </div>
      </div>

      <div className="issue-detail-scroll">
        <h1 className="issue-detail-title">{data.title}</h1>
        <div className="issue-detail-meta">
          {data.author && (
            <>
              <b>{data.author}</b> opened ·{' '}
            </>
          )}
          {relativeTime(data.createdAt)}
          {data.labels.length > 0 && (
            <span className="issue-detail-labels">
              {data.labels.map((l) => (
                <span key={l.name} className="issue-label" style={labelStyle(l.color)}>
                  {l.name}
                </span>
              ))}
            </span>
          )}
        </div>

        <div className="issue-comment-card">
          <div className="issue-comment-head">
            <b>{data.author || 'author'}</b>
            <span>commented · {relativeTime(data.createdAt)}</span>
          </div>
          <div className="obs-md" dangerouslySetInnerHTML={{ __html: md(data.body) }} />
        </div>

        {data.comments.map((c, i) => (
          <div key={i} className="issue-comment-card">
            <div className="issue-comment-head">
              <b>{c.author}</b>
              <span>commented · {relativeTime(c.createdAt)}</span>
            </div>
            <div className="obs-md" dangerouslySetInnerHTML={{ __html: md(c.body) }} />
          </div>
        ))}
      </div>
    </div>
  )
}

interface OpenTab {
  key: string
  repo: string
  number: number
  title: string
}

export function IssuesTab() {
  const { repos } = useRepos()
  const defaultDir = useDefaultSessionDir()
  const ghRepos = useMemo(
    () => repos.filter((r) => r.nameWithOwner).map((r) => r.nameWithOwner as string),
    [repos]
  )
  const [repo, setRepo] = useState<string | null>(null)
  const [stateFilter, setStateFilter] = useState<'open' | 'closed'>('open')

  useEffect(() => {
    if (!repo && ghRepos.length > 0)
      setRepo(ghRepos.includes(DEFAULT_REPO) ? DEFAULT_REPO : ghRepos[0])
  }, [repo, ghRepos])

  const { data, loading, error, reload } = useAsync(
    () => (repo ? window.api.github.issues(repo, stateFilter) : Promise.resolve([])),
    [repo, stateFilter]
  )
  const issues = data ?? []

  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])
  const [active, setActive] = useState<string>('list')

  const localPathFor = (nwo: string): string | undefined =>
    repos.find((r) => r.nameWithOwner === nwo)?.path

  const openIssue = (issue: GhIssue): void => {
    if (!repo) return
    const key = `${repo}#${issue.number}`
    setOpenTabs((t) => (t.some((x) => x.key === key) ? t : [...t, { key, repo, number: issue.number, title: issue.title }]))
    setActive(key)
  }

  const closeTab = (key: string): void =>
    setOpenTabs((t) => {
      const rem = t.filter((x) => x.key !== key)
      if (active === key) setActive(rem.length ? rem[rem.length - 1].key : 'list')
      return rem
    })

  const sendToClaude = (repoName: string, number: number, title: string): void => {
    const prompt =
      `Investigate GitHub issue #${number} in ${repoName}: "${title.replace(/"/g, '')}". ` +
      `Run \`gh issue view ${number} -R ${repoName}\` to read the full description and comments, ` +
      `explore the relevant code, then produce a concrete implementation plan.`
    const quoted = `'${prompt.replace(/'/g, `'\\''`)}'`
    terminalBus.open({
      cwd: localPathFor(repoName) ?? defaultDir,
      initialCommand: `claude --permission-mode plan ${quoted}`,
      label: `plan #${number}`
    })
  }

  const activeTab = openTabs.find((t) => t.key === active)

  return (
    <div className="issues-tab gh-tab">
      <div className="gh-subtabs">
        <button className={`gh-subtab${active === 'list' ? ' active' : ''}`} onClick={() => setActive('list')}>
          Issues
        </button>
        {openTabs.map((t) => (
          <button
            key={t.key}
            className={`gh-subtab${active === t.key ? ' active' : ''}`}
            onClick={() => setActive(t.key)}
            title={t.title}
          >
            #{t.number}
            <span
              className="gh-subtab-x"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(t.key)
              }}
            >
              ✕
            </span>
          </button>
        ))}
      </div>

      {active === 'list' ? (
        <>
          <div className="gh-header">
            <Dropdown
              value={repo ?? ''}
              options={ghRepos.map((r) => ({ value: r, label: r }))}
              onChange={setRepo}
              searchable
              minWidth={240}
              placeholder="repo…"
            />
            <div className="seg">
              <button className={stateFilter === 'open' ? 'on' : ''} onClick={() => setStateFilter('open')}>
                Open
              </button>
              <button className={stateFilter === 'closed' ? 'on' : ''} onClick={() => setStateFilter('closed')}>
                Closed
              </button>
            </div>
            <span className="gh-count">{issues.length}</span>
            <button className="tbtn" style={{ marginLeft: 'auto' }} onClick={reload}>
              ↻ Refresh
            </button>
          </div>
          <div className="issues-list">
            <GhState loading={loading} error={error} empty={issues.length === 0} emptyText="No issues." />
            {issues.map((i) => (
              <IssueRow key={i.number} issue={i} onOpen={openIssue} />
            ))}
          </div>
        </>
      ) : activeTab ? (
        <IssueDetailView
          key={activeTab.key}
          repo={activeTab.repo}
          number={activeTab.number}
          onSendClaude={() => sendToClaude(activeTab.repo, activeTab.number, activeTab.title)}
        />
      ) : null}
    </div>
  )
}
