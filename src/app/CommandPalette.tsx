import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSuspendBrowserViews } from '../lib/browserViewBus'
import { useRepos } from '../sidebar/useRepos'
import { useFlatSessions } from '../sidebar/useFlatSessions'
import { launchClaude } from '../lib/launchClaude'
import { useAgentInfo } from '../lib/useAgentInfo'
import { terminalBus } from '../lib/terminalBus'
import { diffBus } from '../lib/diffBus'

interface Cmd {
  id: string
  label: string
  group: string
  run: () => void
}

export function CommandPalette({
  tabs,
  navigate,
  onClose
}: {
  tabs: { id: string; label: string }[]
  navigate: (tab: string) => void
  onClose: () => void
}) {
  useSuspendBrowserViews() // native browser views paint over DOM — hide while open
  const { repos } = useRepos()
  const sessions = useFlatSessions()
  const agent = useAgentInfo()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const cmds = useMemo<Cmd[]>(() => {
    const out: Cmd[] = []
    for (const t of tabs)
      out.push({ id: `tab:${t.id}`, label: `Go to ${t.label}`, group: 'Navigate', run: () => navigate(t.id) })
    out.push({
      id: 'new-terminal',
      label: 'New terminal',
      group: 'Actions',
      run: () => terminalBus.open({ cwd: repos[0]?.path ?? '~' })
    })
    for (const s of sessions.slice(0, 80)) {
      out.push({
        id: `resume:${s.sessionId}`,
        label: `Resume · ${s.title}`,
        group: 'Sessions',
        run: () => launchClaude({ cwd: s.cwd, resumeId: s.sessionId, label: s.title })
      })
      out.push({
        id: `diff:${s.sessionId}`,
        label: `Diff · ${s.title}`,
        group: 'Sessions',
        run: () => diffBus.openModal(s.cwd, s.title)
      })
    }
    for (const r of repos) {
      out.push({
        id: `claude:${r.path}`,
        label: `${agent.cli} in ${r.name}`,
        group: 'Repos',
        run: () => launchClaude({ cwd: r.path, label: r.name })
      })
      out.push({
        id: `changes:${r.path}`,
        label: `Changes · ${r.name}`,
        group: 'Repos',
        run: () => {
          diffBus.openTab(r.path)
          navigate('changes')
        }
      })
    }
    return out
  }, [tabs, navigate, repos, sessions, agent])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = term ? cmds.filter((c) => c.label.toLowerCase().includes(term)) : cmds
    return list.slice(0, 50)
  }, [cmds, q])

  useEffect(() => setSel(0), [q])
  useEffect(() => {
    listRef.current?.querySelector('.cmd-row.sel')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const run = (c: Cmd): void => {
    c.run()
    onClose()
  }

  return createPortal(
    <div className="modal-backdrop cmd-backdrop" onMouseDown={onClose}>
      <div className="cmd-palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="cmd-input"
          placeholder="Jump to a tab, session, repo… or run an action"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((i) => Math.min(i + 1, filtered.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              if (filtered[sel]) run(filtered[sel])
            } else if (e.key === 'Escape') {
              onClose()
            }
          }}
        />
        <div className="cmd-list" ref={listRef}>
          {filtered.length === 0 && <div className="cmd-empty">No matches.</div>}
          {filtered.map((c, i) => (
            <div
              key={c.id}
              className={`cmd-row${i === sel ? ' sel' : ''}`}
              onMouseEnter={() => setSel(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                run(c)
              }}
            >
              <span className="cmd-label">{c.label}</span>
              <span className="cmd-group">{c.group}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
