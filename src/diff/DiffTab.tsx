import { useEffect, useMemo, useState } from 'react'
import { useRepos } from '../sidebar/useRepos'
import { Dropdown } from '../components/Dropdown'
import { diffBus } from '../lib/diffBus'
import { DiffPanel } from './DiffPanel'

export function DiffTab() {
  const { repos } = useRepos()
  const targets = useMemo(() => {
    const list: { path: string; label: string }[] = []
    for (const r of repos) {
      list.push({ path: r.path, label: `${r.name} · primary` })
      for (const wt of r.worktrees ?? []) {
        if (wt.path !== r.path) list.push({ path: wt.path, label: `${r.name} · ${wt.branch ?? 'worktree'}` })
      }
    }
    return list
  }, [repos])

  const [path, setPath] = useState<string | null>(null)
  useEffect(() => {
    if (!path && targets.length) setPath(targets[0].path)
  }, [path, targets])

  // External requests (e.g. sidebar "Open in Changes tab") focus a path here.
  useEffect(() => diffBus.onTab((p) => setPath(p)), [])

  const options = useMemo(() => {
    const opts = targets.map((t) => ({ value: t.path, label: t.label }))
    if (path && !targets.some((t) => t.path === path))
      opts.unshift({ value: path, label: path.split('/').slice(-2).join('/') })
    return opts
  }, [targets, path])

  return (
    <div className="gh-tab">
      {path ? (
        <DiffPanel
          key={path}
          path={path}
          headerLeft={
            <Dropdown
              value={path}
              options={options}
              onChange={setPath}
              searchable
              minWidth={260}
              placeholder="repo / worktree…"
            />
          }
        />
      ) : (
        <div className="gh-state">No repos found.</div>
      )}
    </div>
  )
}
