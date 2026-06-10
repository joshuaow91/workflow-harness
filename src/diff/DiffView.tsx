// Renders a unified-diff string IDE-style: per-line old/new line numbers, a
// +/− sign gutter, and add/del/hunk/meta coloring. Shared by the local Changes
// panel and the PR-diff modal.

interface Row {
  cls: 'add' | 'del' | 'ctx' | 'hunk' | 'meta'
  oldN: string
  newN: string
  sign: string
  code: string
}

const META_RE =
  /^(?:\+\+\+|---|diff |index |new file|deleted file|rename |similarity |Binary |old mode|new mode)/

function parse(text: string): Row[] {
  const rows: Row[] = []
  let oldLn = 0
  let newLn = 0
  for (const l of text.split('\n')) {
    if (l.startsWith('@@')) {
      const m = l.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) {
        oldLn = Number(m[1])
        newLn = Number(m[2])
      }
      rows.push({ cls: 'hunk', oldN: '', newN: '', sign: '', code: l })
    } else if (META_RE.test(l)) {
      rows.push({ cls: 'meta', oldN: '', newN: '', sign: '', code: l })
    } else if (l.startsWith('+')) {
      rows.push({ cls: 'add', oldN: '', newN: String(newLn++), sign: '+', code: l.slice(1) })
    } else if (l.startsWith('-')) {
      rows.push({ cls: 'del', oldN: String(oldLn++), newN: '', sign: '−', code: l.slice(1) })
    } else {
      // context (leading space) or a blank line
      rows.push({
        cls: 'ctx',
        oldN: String(oldLn++),
        newN: String(newLn++),
        sign: '',
        code: l ? l.slice(1) : ''
      })
    }
  }
  return rows
}

export function DiffView({ text, loading }: { text: string; loading: boolean }) {
  if (loading) return <div className="gh-state">Loading diff…</div>
  if (!text.trim()) return <div className="gh-state">No changes, or select a file.</div>
  const rows = parse(text)
  return (
    <div className="diff-view">
      <div className="diff-code-grid">
        {rows.map((r, i) => (
          <div key={i} className={`diff-line ${r.cls}`}>
            <span className="diff-gutter">{r.oldN}</span>
            <span className="diff-gutter">{r.newN}</span>
            <span className="diff-sign">{r.sign}</span>
            <span className="diff-code">{r.code || ' '}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
