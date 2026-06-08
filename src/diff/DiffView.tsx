// Renders a unified-diff string with add/del/hunk/meta coloring. Shared by the
// local Changes panel and the PR-diff modal.
export function DiffView({ text, loading }: { text: string; loading: boolean }) {
  if (loading) return <div className="gh-state">Loading diff…</div>
  if (!text.trim()) return <div className="gh-state">No changes, or select a file.</div>
  const lines = text.split('\n')
  return (
    <div className="diff-view">
      {lines.map((l, i) => {
        let cls = 'ctx'
        if (l.startsWith('@@')) cls = 'hunk'
        else if (
          l.startsWith('+++') ||
          l.startsWith('---') ||
          l.startsWith('diff ') ||
          l.startsWith('index ') ||
          l.startsWith('new file') ||
          l.startsWith('deleted file') ||
          l.startsWith('rename ') ||
          l.startsWith('similarity ') ||
          l.startsWith('Binary ')
        )
          cls = 'meta'
        else if (l.startsWith('+')) cls = 'add'
        else if (l.startsWith('-')) cls = 'del'
        return (
          <div key={i} className={`diff-line ${cls}`}>
            {l || ' '}
          </div>
        )
      })}
    </div>
  )
}
