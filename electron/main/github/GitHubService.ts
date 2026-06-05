import { execFile } from 'child_process'
import { promisify } from 'util'
import {
  GH_MISSING_PROJECT_SCOPE,
  type GhIssue,
  type GhProjectBoard,
  type GhProjectItem,
  type GhProjectSummary,
  type GhPullRequest,
  type SessionLink
} from '@shared/types'
import { discoverRepos } from '../git/WorktreeService'

const pexec = promisify(execFile)

async function gitBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await pexec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
    return stdout.trim() || null
  } catch {
    return null
  }
}

async function gh(args: string[]): Promise<string> {
  try {
    const { stdout } = await pexec('gh', args, { maxBuffer: 16 * 1024 * 1024 })
    return stdout
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? (err as Error).message
    if (/read:project|required scopes/i.test(stderr)) {
      throw new Error(GH_MISSING_PROJECT_SCOPE)
    }
    throw new Error(stderr.trim() || 'gh command failed')
  }
}

async function ghJson<T>(args: string[]): Promise<T> {
  return JSON.parse(await gh(args)) as T
}

// ---- Checks rollup ----

const FAIL = new Set(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'ERROR', 'STARTUP_FAILURE'])

function rollupChecks(rollup: unknown): string | null {
  if (!Array.isArray(rollup) || rollup.length === 0) return null
  let pending = false
  let failure = false
  for (const c of rollup as Array<Record<string, string>>) {
    const v = (c.conclusion || c.state || '').toUpperCase()
    const status = (c.status || '').toUpperCase()
    if (FAIL.has(v)) failure = true
    else if (!v || v === 'PENDING' || (status && status !== 'COMPLETED')) pending = true
  }
  return failure ? 'FAILURE' : pending ? 'PENDING' : 'SUCCESS'
}

// ---- Issues ----

export async function listIssues(repo: string): Promise<GhIssue[]> {
  type Raw = {
    number: number
    title: string
    state: string
    labels: { name: string; color: string }[]
    assignees: { login: string }[]
    updatedAt: string
    url: string
  }
  const rows = await ghJson<Raw[]>([
    'issue',
    'list',
    '-R',
    repo,
    '--state',
    'open',
    '--limit',
    '50',
    '--json',
    'number,title,state,labels,assignees,updatedAt,url'
  ])
  return rows.map((r) => ({
    number: r.number,
    title: r.title,
    state: r.state,
    labels: r.labels.map((l) => ({ name: l.name, color: l.color })),
    assignees: r.assignees.map((a) => a.login),
    updatedAt: r.updatedAt,
    url: r.url
  }))
}

// ---- Pull requests ----

type RawPR = {
  number: number
  title: string
  state: string
  isDraft: boolean
  headRefName: string
  reviewDecision: string
  statusCheckRollup: unknown
  author: { login: string }
  updatedAt: string
  url: string
}

function mapPR(r: RawPR, repo: string): GhPullRequest {
  return {
    number: r.number,
    title: r.title,
    state: r.state,
    isDraft: r.isDraft,
    headRefName: r.headRefName,
    reviewDecision: r.reviewDecision || null,
    checksState: rollupChecks(r.statusCheckRollup),
    author: r.author?.login ?? '',
    updatedAt: r.updatedAt,
    url: r.url,
    repo
  }
}

export async function listMyPRs(repo: string): Promise<GhPullRequest[]> {
  const rows = await ghJson<RawPR[]>([
    'pr',
    'list',
    '-R',
    repo,
    '--author',
    '@me',
    '--state',
    'open',
    '--limit',
    '50',
    '--json',
    'number,title,state,isDraft,headRefName,reviewDecision,statusCheckRollup,author,updatedAt,url'
  ])
  return rows.map((r) => mapPR(r, repo))
}

export async function listMyPRsAll(): Promise<GhPullRequest[]> {
  type Raw = {
    number: number
    title: string
    repository: { nameWithOwner: string }
    url: string
    isDraft?: boolean
    updatedAt: string
  }
  const rows = await ghJson<Raw[]>([
    'search',
    'prs',
    '--author=@me',
    '--state=open',
    '--limit',
    '100',
    '--json',
    'number,title,repository,url,updatedAt,isDraft'
  ])
  return rows.map((r) => ({
    number: r.number,
    title: r.title,
    state: 'OPEN',
    isDraft: r.isDraft ?? false,
    headRefName: '',
    reviewDecision: null,
    checksState: null,
    author: '',
    updatedAt: r.updatedAt,
    url: r.url,
    repo: r.repository?.nameWithOwner ?? ''
  }))
}

export async function listReviewPRs(): Promise<GhPullRequest[]> {
  type Raw = {
    number: number
    title: string
    repository: { nameWithOwner: string }
    url: string
    author?: { login?: string } | string
    isDraft?: boolean
    updatedAt: string
  }
  const rows = await ghJson<Raw[]>([
    'search',
    'prs',
    '--review-requested=@me',
    '--state=open',
    '--limit',
    '50',
    '--json',
    'number,title,repository,url,author,updatedAt,isDraft'
  ])
  return rows.map((r) => ({
    number: r.number,
    title: r.title,
    state: 'OPEN',
    isDraft: r.isDraft ?? false,
    headRefName: '',
    reviewDecision: 'REVIEW_REQUIRED',
    checksState: null,
    author: typeof r.author === 'string' ? r.author : (r.author?.login ?? ''),
    updatedAt: r.updatedAt,
    url: r.url,
    repo: r.repository?.nameWithOwner ?? ''
  }))
}

// ---- Session link: the PR/issue tied to a session's working dir ----

export async function sessionLink(cwd: string): Promise<SessionLink> {
  const repos = await discoverRepos()
  const repo =
    repos.find((r) => r.path === cwd || r.worktrees.some((w) => w.path === cwd)) ??
    repos.find((r) => cwd.startsWith(r.path))
  const branch = await gitBranch(cwd)
  const issueMatch = branch?.match(/(\d{3,6})/)
  const issueNumber = issueMatch ? Number(issueMatch[1]) : null

  let pr: SessionLink['pr'] = null
  if (repo?.nameWithOwner && branch) {
    try {
      const rows = await ghJson<{ number: number; title: string; url: string; state: string; isDraft: boolean }[]>([
        'pr',
        'list',
        '-R',
        repo.nameWithOwner,
        '--head',
        branch,
        '--state',
        'all',
        '--limit',
        '1',
        '--json',
        'number,title,url,state,isDraft'
      ])
      pr = rows[0] ?? null
    } catch {
      /* gh not available / no PR */
    }
  }
  return { branch, repo: repo?.nameWithOwner ?? null, issueNumber, pr }
}

// ---- Projects v2 (needs read:project scope) ----

export async function listProjects(owner: string): Promise<GhProjectSummary[]> {
  type Raw = { projects: { number: number; title: string; url: string }[] }
  const out = await ghJson<Raw>([
    'project',
    'list',
    '--owner',
    owner,
    '--format',
    'json',
    '--limit',
    '50'
  ])
  return (out.projects ?? []).map((p) => ({ number: p.number, title: p.title, url: p.url }))
}

function nameWithOwnerFromUrl(url: string | undefined): string | null {
  if (!url) return null
  const m = url.match(/github\.com\/([^/]+\/[^/]+)/)
  return m ? m[1] : null
}

export async function projectItems(owner: string, number: number): Promise<GhProjectBoard> {
  type RawItem = {
    title?: string
    status?: string
    content?: { type?: string; url?: string; title?: string; repository?: string }
    [k: string]: unknown
  }
  type Raw = { items: RawItem[]; totalCount?: number }

  const [out, summaries] = await Promise.all([
    ghJson<Raw>([
      'project',
      'item-list',
      String(number),
      '--owner',
      owner,
      '--format',
      'json',
      '--limit',
      '200'
    ]),
    listProjects(owner)
  ])

  const summary = summaries.find((p) => p.number === number)
  const columns: string[] = []
  const items: GhProjectItem[] = (out.items ?? []).map((it, i) => {
    const status = it.status ?? null
    if (status && !columns.includes(status)) columns.push(status)
    const type = (it.content?.type as GhProjectItem['type']) ?? 'DraftIssue'
    return {
      id: `${number}:${i}`,
      title: it.title ?? it.content?.title ?? '(untitled)',
      status,
      type,
      url: it.content?.url ?? null,
      repo: nameWithOwnerFromUrl(it.content?.url) ?? nameWithOwnerFromUrl(it.content?.repository)
    }
  })

  return {
    title: summary?.title ?? `Project #${number}`,
    number,
    url: summary?.url ?? '',
    columns,
    items
  }
}
