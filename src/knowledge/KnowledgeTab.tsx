import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import mermaid from 'mermaid'
import type { RepoKnowledge } from '@shared/types'
import { useAsync } from '../lib/useAsync'
import { refreshMapInfo } from '../lib/launchClaude'
import { useRepos } from '../sidebar/useRepos'

mermaid.initialize({ startOnLoad: false, theme: 'dark' })

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_')
}

// Tidy verbose stacks from older cards (strip parentheticals).
function cleanStack(s: string): string {
  return s.replace(/\s*\([^)]*\)/g, '').trim()
}

function buildMermaid(graph: RepoKnowledge[]): string {
  if (graph.length === 0) return ''
  const names = new Set(graph.map((r) => r.name))
  const lines = ['graph LR']
  for (const r of graph) lines.push(`  ${sanitize(r.name)}["${r.name}"]`)
  for (const r of graph)
    for (const rel of r.related) if (names.has(rel)) lines.push(`  ${sanitize(r.name)} --> ${sanitize(rel)}`)
  return lines.join('\n')
}

export function KnowledgeTab() {
  const { repos } = useRepos()
  const know = useAsync(() => window.api.knowledge.get(), [])
  const graph = useMemo(() => know.data ?? [], [know.data])
  const [svg, setSvg] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const idRef = useRef(0)

  const mmd = useMemo(() => buildMermaid(graph), [graph])
  useEffect(() => {
    if (!mmd) {
      setSvg('')
      return
    }
    let cancelled = false
    mermaid
      .render(`kg-${idRef.current++}`, mmd)
      .then(({ svg }) => !cancelled && setSvg(svg))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [mmd])

  const byPath = new Map(graph.map((r) => [r.path, r]))

  const generateOne = async (path: string): Promise<void> => {
    setBusy(path)
    try {
      await window.api.knowledge.generate(path)
      know.reload()
      refreshMapInfo()
    } catch (e) {
      window.alert(`Could not generate:\n${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const generateAll = async (): Promise<void> => {
    setProgress({ done: 0, total: repos.length })
    for (let i = 0; i < repos.length; i++) {
      try {
        await window.api.knowledge.generate(repos[i].path)
      } catch {
        /* skip failures */
      }
      setProgress({ done: i + 1, total: repos.length })
      know.reload()
    }
    refreshMapInfo()
    setProgress(null)
  }

  return (
    <div className="kg-tab">
      <div className="kg-bar">
        <span className="kg-title">Repo knowledge graph</span>
        <span className="kg-sub">
          {graph.length} documented · Claude reads this via the repo_knowledge MCP tool
        </span>
        <button
          className="tbtn"
          style={{ marginLeft: 'auto' }}
          onClick={generateAll}
          disabled={!!progress || !!busy}
        >
          {progress ? `Generating ${progress.done}/${progress.total}…` : 'Generate all'}
        </button>
      </div>
      <div className="kg-body">
        <div className="kg-info">
          <div className="kg-info-title">What this is & why it saves tokens</div>
          <p>
            Normally, every Claude session re-discovers what a repo is — grepping, reading{' '}
            <code>package.json</code>, walking directories — which burns hundreds to thousands of
            tokens each time. This page builds a small, reusable <strong>knowledge graph</strong> so
            that doesn&apos;t have to happen.
          </p>
          <p>
            <strong>How it works:</strong> “Generate” runs <code>claude</code> once per repo — feeding
            it that repo&apos;s README, manifest (package.json/go.mod/…), and top-level structure — to
            write a concise card: <em>purpose, stack, key paths, and which repos it integrates with</em>
            . The cards are cached locally and never re-explored unless you regenerate.
          </p>
          <p>
            <strong>How Claude uses it:</strong> the graph is exposed through the harness&apos;s{' '}
            <code>repo_knowledge</code> MCP tool. So instead of exploring files to learn “what is{' '}
            <code>blink_reyrey_server</code>,” a session makes <strong>one cheap tool call</strong> and
            gets the whole picture — including the relationship diagram below. Net effect: far fewer
            tokens spent on orientation, more spent on the actual task.
          </p>
        </div>
        {mmd && <div className="kg-graph" dangerouslySetInnerHTML={{ __html: svg }} />}
        <div className="kg-cards">
          {repos.map((repo) => {
            const k = byPath.get(repo.path)
            return (
              <div key={repo.path} className="kg-card">
                <div className="kg-card-head">
                  <span className="kg-card-name">{repo.name}</span>
                  {k?.stack && (
                    <span className="kg-chip" title={k.stack}>
                      {cleanStack(k.stack)}
                    </span>
                  )}
                  <button
                    className="term-act"
                    style={{ marginLeft: 'auto' }}
                    title="Regenerate"
                    disabled={busy === repo.path || !!progress}
                    onClick={() => generateOne(repo.path)}
                  >
                    {busy === repo.path ? '…' : <Icon name="refresh" size={14} />}
                  </button>
                </div>
                {k ? (
                  <>
                    <div className="kg-purpose">{k.purpose}</div>
                    <div className="kg-summary">{k.summary}</div>
                    {k.related.length > 0 && (
                      <div className="kg-related">
                        {k.related.map((r) => (
                          <span key={r} className="kg-rel">
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="kg-empty">Not documented yet — click ↻ to generate.</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
