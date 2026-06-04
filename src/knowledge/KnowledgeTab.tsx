import { useEffect, useMemo, useRef, useState } from 'react'
import mermaid from 'mermaid'
import type { RepoKnowledge } from '@shared/types'
import { useAsync } from '../lib/useAsync'
import { useRepos } from '../sidebar/useRepos'

mermaid.initialize({ startOnLoad: false, theme: 'dark' })

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_')
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
        {mmd && <div className="kg-graph" dangerouslySetInnerHTML={{ __html: svg }} />}
        <div className="kg-cards">
          {repos.map((repo) => {
            const k = byPath.get(repo.path)
            return (
              <div key={repo.path} className="kg-card">
                <div className="kg-card-head">
                  <span className="kg-card-name">{repo.name}</span>
                  {k?.stack && <span className="kg-chip">{k.stack}</span>}
                  <button
                    className="term-act"
                    style={{ marginLeft: 'auto' }}
                    title="Regenerate"
                    disabled={busy === repo.path || !!progress}
                    onClick={() => generateOne(repo.path)}
                  >
                    {busy === repo.path ? '…' : '↻'}
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
