import { useEffect, useState } from 'react'
import type { GreptileThread, PrProjectStatus, SessionRef } from '@shared/types'
import { Dropdown } from '../components/Dropdown'
import { GreptileModal } from './GreptileModal'
import { PrDiffModal } from './PrDiffModal'

// A linked issue/PR in the session sidebar: open-link, a project Status dropdown
// (whichever is on the board — usually the issue), and for PRs the Greptile
// review comments with a "Review in session" action.
export function PrRow({ link, terminalId }: { link: SessionRef; terminalId?: string }) {
  const isPr = link.kind === 'pr'
  const [status, setStatus] = useState<PrProjectStatus | null>(null)
  const [greptile, setGreptile] = useState<GreptileThread[]>([])
  const [showGreptile, setShowGreptile] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let active = true
    const load = (): void => {
      void window.api.github.prStatus(link.repo, link.number, link.kind).then((s) => active && setStatus(s[0] ?? null))
      if (isPr)
        void window.api.github.prGreptile(link.repo, link.number).then((g) => active && setGreptile(g))
    }
    load()
    // Poll so newly-posted Greptile comments / status changes surface (both are
    // cached ~5 min in main, so this is cheap on the API).
    const iv = setInterval(load, 60000)
    return () => {
      active = false
      clearInterval(iv)
    }
  }, [link.repo, link.number, link.kind, isPr])

  const changeStatus = async (optionId: string): Promise<void> => {
    if (!status) return
    const prev = status
    setStatus({
      ...status,
      currentOptionId: optionId || null,
      current: status.options.find((o) => o.id === optionId)?.name ?? null
    })
    try {
      await window.api.github.setProjectField(status.projectId, status.itemId, status.fieldId, optionId)
    } catch (e) {
      setStatus(prev)
      window.alert(`Couldn’t update status:\n${(e as Error).message}`)
    }
  }

  const reviewInSession = (): void => {
    const comments = greptile.flatMap((t) => t.comments)
    if (!terminalId || !comments.length) return
    const lines = comments.map(
      (c, i) =>
        `${i + 1}. ${c.path ? `${c.path}:${c.line ?? '?'} — ` : ''}${c.body.replace(/\s+/g, ' ').trim()}`
    )
    const prompt =
      `Address these Greptile review comments on ${link.repo} PR #${link.number} (${link.url}): ` +
      `${lines.join('   ')}   For each, fix it if it's valid, then reply on the PR comment thread ` +
      `with the disposition (fixed / stale / doesn't apply) and a brief reason.`
    // Stage the prompt in the running session (no auto-submit — you press Enter).
    window.api.terminal.write(terminalId, prompt)
    setSent(true)
    setTimeout(() => setSent(false), 2500)
  }

  return (
    <div className="pr-row">
      <button className="term-sb-link" onClick={() => void window.api.system.openExternal(link.url)}>
        <div className="term-sb-link-row">
          <span className="term-sb-refnum">
            {isPr ? 'PR' : 'Issue'} #{link.number}
          </span>
          {status?.current && <span className="gh-badge in-progress">{status.current}</span>}
        </div>
        <span className="term-sb-repo" title={link.repo}>
          {link.repo.split('/')[1] ?? link.repo}
        </span>
      </button>

      {status ? (
        <Dropdown
          value={status.currentOptionId ?? ''}
          options={[{ value: '', label: 'No status' }, ...status.options.map((o) => ({ value: o.id, label: o.name }))]}
          onChange={(v) => void changeStatus(v)}
          minWidth={140}
        />
      ) : null}

      {isPr && (
        <div className="pr-greptile-bar">
          <button className="pr-greptile-toggle" onClick={() => setShowDiff(true)}>
            ⧉ Diff
          </button>
          {greptile.length > 0 && (
            <button className="pr-greptile-toggle" onClick={() => setShowGreptile(true)}>
              ⊕ Greptile · {greptile.length}
            </button>
          )}
          {greptile.length > 0 && terminalId && (
            <button className="pr-review-btn" onClick={reviewInSession} title="Stage a review prompt in this session">
              {sent ? '✓ staged' : '⌲ Review in session'}
            </button>
          )}
        </div>
      )}

      {showGreptile && (
        <GreptileModal
          repo={link.repo}
          number={link.number}
          threads={greptile}
          onClose={() => setShowGreptile(false)}
        />
      )}
      {showDiff && (
        <PrDiffModal repo={link.repo} number={link.number} onClose={() => setShowDiff(false)} />
      )}
    </div>
  )
}
