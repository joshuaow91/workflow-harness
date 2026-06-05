import { useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import type { GhIssue } from '@shared/types'
import { useAsync } from '../lib/useAsync'
import { useRepos } from '../sidebar/useRepos'
import { useDefaultSessionDir, useSettings } from '../lib/settingsStore'
import { terminalBus } from '../lib/terminalBus'
import { relativeTime } from '../lib/time'
import { Dropdown } from '../components/Dropdown'
import { Icon } from '../components/Icon'
import { GhState } from './GhShared'
import { IssuesBoard } from './IssuesBoard'
import { IssueSidebar } from './IssueSidebar'

const DEFAULT_REPO = 'blink-ai/blink_server'
const PAGE = 50
const UI_KEY = 'harness:issues-ui'

interface SavedUi {
  repo?: string | null
  view?: 'list' | 'board'
  stateFilter?: 'open' | 'closed'
  search?: string
  openTabs?: OpenTab[]
  active?: string
}
function loadUi(): SavedUi {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY) || '{}') as SavedUi
  } catch {
    return {}
  }
}

function labelStyle(hex: string): React.CSSProperties {
  const c = (hex || '888888').replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return { backgroundColor: `#${c}`, color: lum > 0.6 ? '#1b1b1f' : '#ffffff' }
}

// Renders issue/comment markdown, proxying images through the authenticated gh
// token so GitHub-attached images in private repos load (and aren't broken).
function IssueMarkdown({ src }: { src: string }) {
  const html = useMemo(
    () => marked.parse(src || '_No description provided._', { gfm: true, async: false }) as string,
    [src]
  )
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.querySelectorAll('img').forEach((img) => {
      const s = img.getAttribute('src') || ''
      if (!s || s.startsWith('data:')) return
      img.style.opacity = '0.45'
      void window.api.github
        .fetchAsset(s)
        .then((d) => {
          img.src = d
          img.style.opacity = '1'
        })
        .catch(() => {
          img.style.opacity = '1'
        })
    })
  }, [html])
  return <div className="obs-md" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
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
          {issue.milestone && ` · 🏁 ${issue.milestone}`}
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
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <div className="gh-state">Loading issue…</div>
  if (error) return <div className="gh-state gh-error">{error}</div>
  if (!data) return null

  const postComment = async (): Promise<void> => {
    if (!draft.trim()) return
    setBusy(true)
    try {
      await window.api.github.addComment(repo, number, draft.trim())
      setDraft('')
      reload()
    } catch (e) {
      window.alert(`Could not comment:\n${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  const toggleState = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.github.setIssueState(repo, number, data.state === 'OPEN' ? 'close' : 'reopen')
      reload()
    } catch (e) {
      window.alert(`Could not change state:\n${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="issue-detail">
      <div className="issue-detail-head">
        <span className={`issue-state ${data.state.toLowerCase()}`}>
          <Icon name="issue" size={13} /> {data.state.toLowerCase()}
        </span>
        <span className="issue-detail-num">
          {repo} #{data.number}
        </span>
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

      <div className="issue-detail-cols">
        <div className="issue-detail-scroll">
          <h1 className="issue-detail-title">{data.title}</h1>
          <div className="issue-detail-meta">
            {data.author && (
              <>
                <b>{data.author}</b> opened ·{' '}
              </>
            )}
            {relativeTime(data.createdAt)}
          </div>

          <div className="issue-comment-card">
            <div className="issue-comment-head">
              <b>{data.author || 'author'}</b>
              <span>commented · {relativeTime(data.createdAt)}</span>
            </div>
            <div className="issue-comment-body">
              <IssueMarkdown src={data.body} />
            </div>
          </div>

          {data.comments.map((c, i) => (
            <div key={i} className="issue-comment-card">
              <div className="issue-comment-head">
                <b>{c.author}</b>
                <span>commented · {relativeTime(c.createdAt)}</span>
              </div>
              <div className="issue-comment-body">
                <IssueMarkdown src={c.body} />
              </div>
            </div>
          ))}

          <div className="issue-composer">
            <textarea
              className="issue-composer-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Leave a comment (Markdown supported)…"
              rows={4}
            />
            <div className="issue-composer-actions">
              <button className="tbtn" disabled={busy} onClick={toggleState}>
                {data.state === 'OPEN' ? 'Close issue' : 'Reopen issue'}
              </button>
              <button className="tbtn primary" disabled={busy || !draft.trim()} onClick={postComment}>
                Comment
              </button>
            </div>
          </div>
        </div>

        <IssueSidebar repo={repo} number={number} detail={data} onChanged={reload} />
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
  const settings = useSettings()
  const ghRepos = useMemo(
    () => repos.filter((r) => r.nameWithOwner).map((r) => r.nameWithOwner as string),
    [repos]
  )
  const saved = useRef(loadUi()).current
  const [repo, setRepo] = useState<string | null>(saved.repo ?? null)
  const [view, setView] = useState<'list' | 'board'>(saved.view ?? 'list')
  const [stateFilter, setStateFilter] = useState<'open' | 'closed'>(saved.stateFilter ?? 'open')
  const [searchInput, setSearchInput] = useState(saved.search ?? '')
  const [search, setSearch] = useState(saved.search ?? '')
  const [limit, setLimit] = useState(PAGE)

  useEffect(() => {
    if (!repo && ghRepos.length > 0)
      setRepo(ghRepos.includes(DEFAULT_REPO) ? DEFAULT_REPO : ghRepos[0])
  }, [repo, ghRepos])

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setLimit(PAGE)
    }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, loading, error, reload } = useAsync(
    () => (repo ? window.api.github.issues(repo, stateFilter, search, limit) : Promise.resolve([])),
    [repo, stateFilter, search, limit]
  )
  const issues = data ?? []

  const [openTabs, setOpenTabs] = useState<OpenTab[]>(saved.openTabs ?? [])
  const [active, setActive] = useState<string>(saved.active ?? 'list')

  // Remember filters + open detail tabs across navigation/restarts.
  useEffect(() => {
    try {
      localStorage.setItem(
        UI_KEY,
        JSON.stringify({ repo, view, stateFilter, search: searchInput, openTabs, active })
      )
    } catch {
      /* ignore */
    }
  }, [repo, view, stateFilter, searchInput, openTabs, active])

  const localPathFor = (nwo: string): string | undefined =>
    repos.find((r) => r.nameWithOwner === nwo)?.path

  const openRef = (r: string, number: number, title: string): void => {
    const key = `${r}#${number}`
    setOpenTabs((t) => (t.some((x) => x.key === key) ? t : [...t, { key, repo: r, number, title }]))
    setActive(key)
  }
  const openIssue = (issue: GhIssue): void => {
    if (repo) openRef(repo, issue.number, issue.title)
  }

  const closeTab = (key: string): void =>
    setOpenTabs((t) => {
      const rem = t.filter((x) => x.key !== key)
      if (active === key) setActive(rem.length ? rem[rem.length - 1].key : 'list')
      return rem
    })

  const sendToClaude = (repoName: string, number: number, title: string): void => {
    const extras: string[] = []
    if (settings?.mongoUri)
      extras.push(
        `A READ-ONLY MongoDB connection string is available for querying data — never write: ${settings.mongoUri}.`
      )
    if (settings?.ddApiKey)
      extras.push('The datadog-mcp MCP tools are available for logs, metrics, traces and RUM.')
    const prompt =
      `Investigate GitHub issue #${number} in ${repoName}: "${title.replace(/"/g, '')}". ` +
      `Run \`gh issue view ${number} -R ${repoName}\` to read the full description and comments, ` +
      `explore the relevant code, then produce a concrete implementation plan. ${extras.join(' ')}`.trim()
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
              minWidth={200}
              placeholder="repo…"
            />
            <div className="seg">
              <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
                List
              </button>
              <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>
                Board
              </button>
            </div>
            {view === 'list' && (
              <>
                <input
                  className="issue-search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search issues (label:bug author:@me …)"
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
              </>
            )}
          </div>
          {view === 'list' ? (
            <div className="issues-list">
              <GhState loading={loading} error={error} empty={issues.length === 0} emptyText="No issues match." />
              {issues.map((i) => (
                <IssueRow key={i.number} issue={i} onOpen={openIssue} />
              ))}
              {issues.length >= limit && (
                <button className="issue-loadmore" onClick={() => setLimit((l) => l + PAGE)}>
                  Load more
                </button>
              )}
            </div>
          ) : repo ? (
            <IssuesBoard owner={repo.split('/')[0]} onOpenItem={openRef} />
          ) : null}
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
