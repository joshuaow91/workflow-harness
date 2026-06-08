import { execFile } from 'child_process'
import { get as httpsGet } from 'https'
import { promisify } from 'util'
import {
  GH_MISSING_PROJECT_SCOPE,
  type GhIssue,
  type GhIssueDetail,
  type GhProjectBoard,
  type GhProjectItem,
  type GhProjectSummary,
  type GhPullRequest
} from '@shared/types'

const pexec = promisify(execFile)

// ---- Authenticated asset fetch (GitHub-attached images in private repos) ----

let tokenCache: string | null = null
async function ghToken(): Promise<string> {
  if (tokenCache) return tokenCache
  const { stdout } = await pexec('gh', ['auth', 'token'])
  tokenCache = stdout.trim()
  return tokenCache
}

export async function fetchAsset(url: string): Promise<string> {
  const token = await ghToken().catch(() => '')
  return new Promise<string>((resolve, reject) => {
    const go = (u: string, depth: number): void => {
      if (depth > 5) return reject(new Error('too many redirects'))
      let parsed: URL
      try {
        parsed = new URL(u)
      } catch {
        return reject(new Error('bad url'))
      }
      // Only send the GitHub token to GitHub hosts — never to redirected S3 URLs.
      const isGitHub = /(^|\.)github(usercontent)?\.com$/.test(parsed.hostname)
      const headers: Record<string, string> = { 'User-Agent': 'workflow-harness' }
      if (isGitHub && token) headers.Authorization = `token ${token}`
      httpsGet(
        { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume()
            return go(new URL(res.headers.location, u).toString(), depth + 1)
          }
          if (res.statusCode !== 200) {
            res.resume()
            return reject(new Error(`status ${res.statusCode}`))
          }
          const chunks: Buffer[] = []
          let size = 0
          res.on('data', (c: Buffer) => {
            size += c.length
            if (size > 12 * 1024 * 1024) {
              res.destroy()
              reject(new Error('asset too large'))
              return
            }
            chunks.push(c)
          })
          res.on('end', () => {
            const mime = (res.headers['content-type'] as string) || 'image/png'
            resolve(`data:${mime};base64,${Buffer.concat(chunks).toString('base64')}`)
          })
        }
      ).on('error', reject)
    }
    go(url, 0)
  })
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

export async function listIssues(
  repo: string,
  state = 'open',
  search = '',
  limit = 50
): Promise<GhIssue[]> {
  type Raw = {
    number: number
    title: string
    state: string
    labels: { name: string; color: string }[]
    assignees: { login: string }[]
    updatedAt: string
    url: string
    milestone: { title: string } | null
  }
  const st = state === 'closed' || state === 'all' ? state : 'open'
  const args = ['issue', 'list', '-R', repo, '--limit', String(limit), '--json', 'number,title,state,labels,assignees,updatedAt,url,milestone']
  if (search.trim()) args.push('--search', `${search.trim()} state:${st} sort:updated-desc`)
  else args.push('--state', st)
  const rows = await ghJson<Raw[]>(args)
  return rows.map((r) => ({
    number: r.number,
    title: r.title,
    state: r.state,
    labels: r.labels.map((l) => ({ name: l.name, color: l.color })),
    assignees: r.assignees.map((a) => a.login),
    updatedAt: r.updatedAt,
    url: r.url,
    milestone: r.milestone?.title ?? null
  }))
}

const BOARD_QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issueOrPullRequest(number:$number){... on Issue{projectItems(first:5){nodes{st:fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}} ... on PullRequest{projectItems(first:5){nodes{st:fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}}}}}`

const boardStatusCache = new Map<string, { at: number; v: string | null }>()
async function fetchBoardStatus(repo: string, number: number): Promise<string | null> {
  const [owner, name] = repo.split('/')
  if (!owner || !name) return null
  const ck = `${repo}#${number}`
  const c = boardStatusCache.get(ck)
  if (c && Date.now() - c.at < 300000) return c.v // 5 min
  try {
    const out = await ghJson<{
      data?: { repository?: { issueOrPullRequest?: { projectItems?: { nodes?: { st?: { name?: string } }[] } } } }
    }>(['api', 'graphql', '-f', `query=${BOARD_QUERY}`, '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `number=${number}`])
    const nodes = out.data?.repository?.issueOrPullRequest?.projectItems?.nodes ?? []
    const v = nodes.find((n) => n?.st?.name)?.st?.name ?? null
    boardStatusCache.set(ck, { at: Date.now(), v })
    return v
  } catch {
    /* no project scope */
  }
  boardStatusCache.set(ck, { at: Date.now(), v: null })
  return null
}

export async function issueDetail(repo: string, number: number): Promise<GhIssueDetail> {
  type Raw = {
    number: number
    title: string
    body: string
    state: string
    author: { login: string }
    labels: { name: string; color: string }[]
    assignees: { login: string }[]
    url: string
    createdAt: string
    milestone: { title: string } | null
    comments: { author: { login: string }; body: string; createdAt: string }[]
  }
  const [r, boardStatus] = await Promise.all([
    ghJson<Raw>([
      'issue',
      'view',
      String(number),
      '-R',
      repo,
      '--json',
      'number,title,body,state,author,labels,assignees,url,createdAt,milestone,comments'
    ]),
    fetchBoardStatus(repo, number)
  ])
  return {
    number: r.number,
    title: r.title,
    body: r.body ?? '',
    state: r.state,
    author: r.author?.login ?? '',
    labels: (r.labels ?? []).map((l) => ({ name: l.name, color: l.color })),
    assignees: (r.assignees ?? []).map((a) => a.login),
    url: r.url,
    createdAt: r.createdAt,
    milestone: r.milestone?.title ?? null,
    boardStatus,
    comments: (r.comments ?? []).map((c) => ({
      author: c.author?.login ?? '',
      body: c.body ?? '',
      createdAt: c.createdAt
    }))
  }
}

export async function addIssueComment(repo: string, number: number, body: string): Promise<void> {
  await gh(['issue', 'comment', String(number), '-R', repo, '--body', body])
}

// Repo metadata for the sidebar editors rarely changes — cache per repo 5 min.
const metaCache = new Map<string, { at: number; data: unknown }>()
async function cachedMeta<T>(key: string, fetch: () => Promise<T>): Promise<T> {
  const c = metaCache.get(key)
  if (c && Date.now() - c.at < 300000) return c.data as T
  const data = await fetch()
  metaCache.set(key, { at: Date.now(), data })
  return data
}

export async function rateLimit(): Promise<import('@shared/types').GhRateLimit> {
  const out = await ghJson<{ resources: Record<string, { remaining: number; limit: number; reset: number }> }>([
    'api',
    'rate_limit'
  ])
  const pick = (k: string): { remaining: number; limit: number; reset: number } => {
    const r = out.resources?.[k]
    return { remaining: r?.remaining ?? 0, limit: r?.limit ?? 0, reset: r?.reset ?? 0 }
  }
  return { graphql: pick('graphql'), core: pick('core') }
}

export async function repoLabels(repo: string): Promise<{ name: string; color: string }[]> {
  return cachedMeta(`labels:${repo}`, () =>
    ghJson<{ name: string; color: string }[]>(['label', 'list', '-R', repo, '--limit', '200', '--json', 'name,color'])
  )
}

export async function repoAssignees(repo: string): Promise<string[]> {
  return cachedMeta(`assignees:${repo}`, async () => {
    const rows = await ghJson<{ login: string }[]>(['api', `repos/${repo}/assignees?per_page=100`])
    return rows.map((a) => a.login)
  })
}

export async function repoMilestones(repo: string): Promise<string[]> {
  return cachedMeta(`milestones:${repo}`, async () => {
    const rows = await ghJson<{ title: string }[]>(['api', `repos/${repo}/milestones?state=open&per_page=100`])
    return rows.map((m) => m.title)
  })
}

export async function editIssue(repo: string, number: number, patch: GhIssueEditImport): Promise<void> {
  const args = ['issue', 'edit', String(number), '-R', repo]
  for (const l of patch.addLabels ?? []) args.push('--add-label', l)
  for (const l of patch.removeLabels ?? []) args.push('--remove-label', l)
  for (const a of patch.addAssignees ?? []) args.push('--add-assignee', a)
  for (const a of patch.removeAssignees ?? []) args.push('--remove-assignee', a)
  if (patch.milestone === null) args.push('--remove-milestone')
  else if (patch.milestone) args.push('--milestone', patch.milestone)
  if (args.length > 5) await gh(args)
}
type GhIssueEditImport = import('@shared/types').GhIssueEdit

export async function setIssueState(repo: string, number: number, action: 'close' | 'reopen'): Promise<void> {
  await gh(['issue', action, String(number), '-R', repo])
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

// ---- Enrich session PR/issue refs with current state (cached, short TTL) ----

const stateCache = new Map<string, { at: number; data: Partial<SessionRefImport> }>()
type SessionRefImport = import('@shared/types').SessionRef

const STATUS_FRAG = `projectItems(first:5){nodes{st:fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}`

function refBlock(r: SessionRefImport, i: number, withBoard: boolean): string {
  const [owner, name] = r.repo.split('/')
  const frag = withBoard ? STATUS_FRAG : ''
  return `r${i}: repository(owner:"${owner}", name:"${name}"){ issueOrPullRequest(number:${r.number}){ __typename ... on Issue{ state ${frag} } ... on PullRequest{ state isDraft reviewDecision ${frag} } } }`
}

type GqlNode = {
  state?: string
  isDraft?: boolean
  reviewDecision?: string
  projectItems?: { nodes?: { st?: { name?: string } }[] }
}

// Fetch every ref's state (+ board status) in ONE GraphQL request via aliases,
// instead of 2 API calls per ref. Falls back to a board-less query if the token
// lacks read:project (so states still resolve).
async function batchStates(refs: SessionRefImport[]): Promise<Map<string, Partial<SessionRefImport>>> {
  const map = new Map<string, Partial<SessionRefImport>>()
  if (refs.length === 0) return map
  const run = async (withBoard: boolean): Promise<void> => {
    const query = `query{ ${refs.map((r, i) => refBlock(r, i, withBoard)).join('\n')} }`
    const out = await ghJson<{ data?: Record<string, { issueOrPullRequest?: GqlNode }> }>([
      'api',
      'graphql',
      '-f',
      `query=${query}`
    ])
    refs.forEach((r, i) => {
      const node = out.data?.[`r${i}`]?.issueOrPullRequest
      if (!node) return
      const board = node.projectItems?.nodes?.find((n) => n?.st?.name)?.st?.name
      map.set(r.url, {
        state: node.state,
        isDraft: node.isDraft,
        reviewDecision: node.reviewDecision || undefined,
        boardStatus: board || undefined
      })
    })
  }
  try {
    await run(true)
  } catch (e) {
    if (/read:project|required scopes/i.test((e as Error).message)) await run(false).catch(() => undefined)
  }
  return map
}

export async function enrichLinks(refs: SessionRefImport[]): Promise<SessionRefImport[]> {
  const now = Date.now()
  const stale = refs.filter((r) => {
    const c = stateCache.get(r.url)
    return !(c && now - c.at < 600000) // cache 10 min
  })
  if (stale.length) {
    const states = await batchStates(stale)
    for (const [url, data] of states) stateCache.set(url, { at: now, data })
  }
  return refs.map((r) => ({ ...r, ...(stateCache.get(r.url)?.data ?? {}) }))
}

// ---- Projects v2 (needs read:project scope) ----

const projectsCache = new Map<string, { at: number; data: GhProjectSummary[] }>()

export async function listProjects(owner: string): Promise<GhProjectSummary[]> {
  const cached = projectsCache.get(owner)
  if (cached && Date.now() - cached.at < 300000) return cached.data // 5 min
  type Raw = { projects: { number: number; title: string; url: string }[] }
  const out = await ghJson<Raw>(['project', 'list', '--owner', owner, '--format', 'json', '--limit', '50'])
  const data = (out.projects ?? []).map((p) => ({ number: p.number, title: p.title, url: p.url }))
  projectsCache.set(owner, { at: Date.now(), data })
  return data
}

function nameWithOwnerFromUrl(url: string | undefined): string | null {
  if (!url) return null
  const m = url.match(/github\.com\/([^/]+\/[^/]+)/)
  return m ? m[1] : null
}

const boardCache = new Map<string, { at: number; data: GhProjectBoard }>()

export async function projectItems(owner: string, number: number, force = false): Promise<GhProjectBoard> {
  // The board fetch (item-list of all cards) is GraphQL-point-expensive; cache it
  // so re-opening the tab / re-rendering doesn't re-query. Refresh forces.
  const cacheKey = `${owner}/${number}`
  const cached = boardCache.get(cacheKey)
  if (!force && cached && Date.now() - cached.at < 300000) return cached.data // 5 min

  type RawItem = {
    id: string
    title?: string
    assignees?: string[]
    content?: { type?: string; url?: string; title?: string; repository?: string }
    [k: string]: unknown
  }
  type RawField = { id: string; name: string; options?: { id: string; name: string }[] }

  const [itemsOut, fieldsOut, viewOut, summaries] = await Promise.all([
    ghJson<{ items: RawItem[] }>(['project', 'item-list', String(number), '--owner', owner, '--format', 'json', '--limit', '400']),
    ghJson<{ fields: RawField[] }>(['project', 'field-list', String(number), '--owner', owner, '--format', 'json', '--limit', '50']),
    ghJson<{ id: string }>(['project', 'view', String(number), '--owner', owner, '--format', 'json']),
    listProjects(owner)
  ])

  const summary = summaries.find((p) => p.number === number)
  const fields = (fieldsOut.fields ?? [])
    .filter((f) => Array.isArray(f.options) && f.options.length > 0)
    .map((f) => ({ id: f.id, name: f.name, options: (f.options ?? []).map((o) => ({ id: o.id, name: o.name })) }))

  const items: GhProjectItem[] = (itemsOut.items ?? []).map((it) => {
    const fieldValues: Record<string, string> = {}
    for (const f of fields) {
      const v = it[f.name.toLowerCase()]
      if (typeof v === 'string') fieldValues[f.name] = v
    }
    return {
      id: it.id,
      title: it.title ?? it.content?.title ?? '(untitled)',
      type: (it.content?.type as GhProjectItem['type']) ?? 'DraftIssue',
      url: it.content?.url ?? null,
      repo: it.content?.repository ?? nameWithOwnerFromUrl(it.content?.url),
      assignees: it.assignees ?? [],
      fieldValues
    }
  })

  const result: GhProjectBoard = {
    title: summary?.title ?? `Project #${number}`,
    number,
    url: summary?.url ?? '',
    projectId: viewOut.id,
    fields,
    items
  }
  boardCache.set(cacheKey, { at: Date.now(), data: result })
  return result
}

export async function setProjectItemField(
  projectId: string,
  itemId: string,
  fieldId: string,
  optionId: string
): Promise<void> {
  const base = ['project', 'item-edit', '--id', itemId, '--project-id', projectId, '--field-id', fieldId]
  // Empty optionId clears the field (drag back to "No status").
  await gh(optionId ? [...base, '--single-select-option-id', optionId] : [...base, '--clear'])
  boardCache.clear() // next non-optimistic load should see the change
}

// Small 5-min cache for the per-PR auxiliary lookups (status + greptile), keyed
// by type+repo#number, so re-renders don't re-query.
const prAuxCache = new Map<string, { at: number; data: unknown }>()
async function prAux<T>(key: string, fetch: () => Promise<T>, ttl = 300000): Promise<T> {
  const hit = prAuxCache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.data as T
  const data = await fetch()
  prAuxCache.set(key, { at: Date.now(), data })
  return data
}

// Targeted query for just this issue/PR's project item(s) + Status field — ~1
// GraphQL point, vs. the whole-board fetch. One entry per project it's on.
export async function prProjectStatus(
  repo: string,
  number: number,
  kind: 'issue' | 'pr'
): Promise<import('@shared/types').PrProjectStatus[]> {
  return prAux(`status:${kind}:${repo}#${number}`, async () => {
    const [owner, name] = repo.split('/')
    const root = kind === 'pr' ? 'pullRequest' : 'issue'
    const q = `query{repository(owner:"${owner}",name:"${name}"){${root}(number:${number}){projectItems(first:10){nodes{id project{id title field(name:"Status"){... on ProjectV2SingleSelectField{id options{id name}}}} fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{optionId name}}}}}}}`
    type Node = {
      id: string
      project?: { id: string; title: string; field?: { id: string; options?: { id: string; name: string }[] } }
      fieldValueByName?: { optionId?: string; name?: string } | null
    }
    let out: { data?: { repository?: Record<string, { projectItems?: { nodes?: Node[] } } | null> } }
    try {
      out = await ghJson(['api', 'graphql', '-f', `query=${q}`])
    } catch {
      return []
    }
    const nodes = out.data?.repository?.[root]?.projectItems?.nodes ?? []
    const res: import('@shared/types').PrProjectStatus[] = []
    for (const n of nodes) {
      if (!n.project?.field?.id) continue
      res.push({
        projectId: n.project.id,
        projectTitle: n.project.title,
        itemId: n.id,
        fieldId: n.project.field.id,
        current: n.fieldValueByName?.name ?? null,
        currentOptionId: n.fieldValueByName?.optionId ?? null,
        options: n.project.field.options ?? []
      })
    }
    return res
  })
}

// The full PR diff (checkout-independent), via gh. Cached 5 min.
export async function prDiff(repo: string, number: number): Promise<string> {
  return prAux(`diff:${repo}#${number}`, () => gh(['pr', 'diff', String(number), '-R', repo]).catch(() => ''))
}

// Greptile review for a PR: the "Confidence Score: N/5" + summary from the PR
// description, plus the resolvable inline review threads. One GraphQL query,
// cached 60s so newly-posted Greptile feedback surfaces quickly.
export async function prGreptileReview(
  repo: string,
  number: number
): Promise<import('@shared/types').GreptileReview> {
  return prAux(
    `greptile:${repo}#${number}`,
    async () => {
      const [owner, name] = repo.split('/')
      const q = `query{repository(owner:"${owner}",name:"${name}"){pullRequest(number:${number}){body reviewThreads(first:100){nodes{id isResolved path line comments(first:30){nodes{databaseId author{login} body url}}}}}}}`
      type Comment = { databaseId?: number; author?: { login?: string }; body?: string; url?: string }
      type Thread = { id: string; isResolved: boolean; path?: string; line?: number; comments?: { nodes?: Comment[] } }
      let out: { data?: { repository?: { pullRequest?: { body?: string; reviewThreads?: { nodes?: Thread[] } } } } }
      try {
        out = await ghJson(['api', 'graphql', '-f', `query=${q}`])
      } catch {
        return { confidence: null, summary: '', threads: [] }
      }
      const pr = out.data?.repository?.pullRequest
      const body = pr?.body ?? ''
      const m = body.match(/Confidence Score:\s*(\d)\s*\/\s*5/i)
      const confidence = m ? Number(m[1]) : null
      let summary = ''
      if (m) {
        const after = body.slice(body.indexOf(m[0]) + m[0].length)
        // up to the next markdown heading / "Important Files" section
        summary = after.split(/\n#{1,6}\s|\n\s*\*?\*?Important Files/i)[0].trim().slice(0, 1000)
      }
      const threads = (pr?.reviewThreads?.nodes ?? [])
        .filter((t) => (t.comments?.nodes ?? []).some((c) => (c.author?.login ?? '').toLowerCase().includes('greptile')))
        .map((t) => {
          const comments = t.comments?.nodes ?? []
          return {
            id: t.id,
            isResolved: t.isResolved,
            replyToId: comments[0]?.databaseId ?? null,
            comments: comments.map((c) => ({
              author: c.author?.login ?? 'greptile',
              body: c.body ?? '',
              path: t.path,
              line: t.line,
              url: c.url ?? ''
            }))
          }
        })
      return { confidence, summary, threads }
    },
    60000
  )
}

async function resolveReviewThreadById(threadId: string): Promise<void> {
  const q = `mutation{resolveReviewThread(input:{threadId:"${threadId}"}){thread{id}}}`
  await ghJson(['api', 'graphql', '-f', `query=${q}`])
  prAuxCache.clear()
}

export async function resolveGreptileThread(threadId: string): Promise<void> {
  await resolveReviewThreadById(threadId)
}

// Defer: post a "deferred" reply, then resolve the thread.
export async function deferGreptileThread(
  repo: string,
  prNumber: number,
  threadId: string,
  replyToId: number | null
): Promise<void> {
  if (replyToId) {
    await gh([
      'api',
      `repos/${repo}/pulls/${prNumber}/comments/${replyToId}/replies`,
      '-f',
      'body=Deferred — will address in a follow-up.'
    ]).catch(() => '')
  }
  await resolveReviewThreadById(threadId)
}
