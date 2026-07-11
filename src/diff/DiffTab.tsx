import { useEffect, useMemo, useRef, useState } from 'react'
import { useRepos } from '../sidebar/useRepos'
import { Dropdown } from '../components/Dropdown'
import { diffBus } from '../lib/diffBus'
import { TerminalPane } from '../panes/TerminalPane'

// The Diff tab reviews changes with `hunk` (a terminal diff viewer) running in an
// embedded pty, rather than our own DOM renderer. A repo/session picks the cwd;
// sessions route their diff here via diffBus. The pty persists across tab switches
// because AppShell keeps this tab mounted (display:none when hidden).
type Mode = 'working' | 'commit'
const MODE_CMD: Record<Mode, string> = { working: 'hunk diff', commit: 'hunk show' }

export function DiffTab({ active }: { active: boolean }) {
  const { repos } = useRepos()
  const [cwd, setCwd] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('working')
  const [termId, setTermId] = useState<string | null>(null)
  const termRef = useRef<string | null>(null)

  // Only start hunk once the tab has actually been opened (don't spawn a TUI at
  // app start for a tab you may never look at).
  const [visited, setVisited] = useState(false)
  useEffect(() => {
    if (active) setVisited(true)
  }, [active])

  // Default to the first repo's working tree.
  useEffect(() => {
    if (!cwd && repos.length) setCwd(repos[0].path)
  }, [cwd, repos])

  // A session's "View diff" routes its cwd here (working-tree review).
  useEffect(
    () =>
      diffBus.onTab((p) => {
        setMode('working')
        setCwd(p)
      }),
    []
  )

  const cmd = MODE_CMD[mode]

  // (Re)spawn hunk whenever the target cwd or mode changes.
  useEffect(() => {
    if (!visited || !cwd) return
    let cancelled = false
    if (termRef.current) {
      window.api.terminal.kill(termRef.current)
      termRef.current = null
    }
    setTermId(null)
    void window.api.terminal.create({ cwd, initialCommand: cmd, label: 'hunk' }).then((id) => {
      if (cancelled) {
        window.api.terminal.kill(id)
        return
      }
      termRef.current = id
      setTermId(id)
    })
    return () => {
      cancelled = true
    }
  }, [visited, cwd, cmd])

  // Tear down the pty if the tab ever unmounts.
  useEffect(
    () => () => {
      if (termRef.current) window.api.terminal.kill(termRef.current)
    },
    []
  )

  const reload = (): void => {
    if (termRef.current) window.api.terminal.kill(termRef.current)
    termRef.current = null
    setTermId(null)
    if (!cwd) return
    void window.api.terminal.create({ cwd, initialCommand: cmd, label: 'hunk' }).then((id) => {
      termRef.current = id
      setTermId(id)
    })
  }

  const repoOptions = useMemo(() => {
    const opts = repos.map((r) => ({ value: r.path, label: r.name }))
    if (cwd && !repos.some((r) => r.path === cwd))
      opts.unshift({ value: cwd, label: cwd.split('/').slice(-2).join('/') })
    return opts
  }, [repos, cwd])

  return (
    <div className="gh-tab diff-hunk-tab">
      <div className="gh-header">
        <Dropdown
          value={cwd ?? ''}
          options={repoOptions}
          onChange={(v) => setCwd(v)}
          searchable
          minWidth={200}
          placeholder="repo / session…"
        />
        <div className="seg">
          <button className={mode === 'working' ? 'on' : ''} onClick={() => setMode('working')}>
            Working tree
          </button>
          <button className={mode === 'commit' ? 'on' : ''} onClick={() => setMode('commit')}>
            Last commit
          </button>
        </div>
        <button className="tbtn" style={{ marginLeft: 'auto' }} onClick={reload}>
          ↻ Reload
        </button>
      </div>
      <div className="diff-hunk-body">
        {termId ? (
          <div className="term-pane-term">
            <TerminalPane id={termId} />
          </div>
        ) : (
          <div className="gh-state">
            {cwd ? 'Starting hunk…' : 'No repos found.'}
          </div>
        )}
      </div>
    </div>
  )
}
