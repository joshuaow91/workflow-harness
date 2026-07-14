import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { focusTerminal } from '../lib/terminalFocus'
import { promptTemplates, usePromptTemplates } from '../lib/promptTemplates'

// Manage reusable prompt templates and inject one into a session's input. Injection
// uses bracketed paste (ESC[200~ … ESC[201~) so a multi-line template lands in
// claude's prompt as one editable block instead of submitting on each newline.
export function PromptTemplatesModal({
  terminalId,
  onClose
}: {
  terminalId: string
  onClose: () => void
}) {
  const templates = usePromptTemplates()
  const [selId, setSelId] = useState<string | 'new'>(templates[0]?.id ?? 'new')
  const [name, setName] = useState('')
  const [body, setBody] = useState('')

  // Load the selected template into the editor.
  useEffect(() => {
    if (selId === 'new') {
      setName('')
      setBody('')
      return
    }
    const t = templates.find((x) => x.id === selId)
    if (t) {
      setName(t.name)
      setBody(t.body)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId])

  const dirty =
    selId === 'new'
      ? !!(name.trim() || body.trim())
      : (() => {
          const t = templates.find((x) => x.id === selId)
          return !!t && (t.name !== name || t.body !== body)
        })()

  const save = (): void => {
    const n = name.trim()
    if (!n || !body.trim()) return
    if (selId === 'new') setSelId(promptTemplates.add(n, body).id)
    else promptTemplates.update(selId, n, body)
  }

  const del = (): void => {
    if (selId === 'new') return
    if (!window.confirm(`Delete template "${name}"?`)) return
    promptTemplates.remove(selId)
    setSelId(templates.find((t) => t.id !== selId)?.id ?? 'new')
  }

  const inject = (): void => {
    if (!body.trim()) return
    if (dirty) save() // persist edits before injecting
    window.api.terminal.write(terminalId, `\x1b[200~${body}\x1b[201~`)
    focusTerminal(terminalId)
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal tpl-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="branch-modal-title">Prompt templates</span>
          <button className="term-act" title="Close" onClick={onClose}>
            <Icon name="close" size={13} />
          </button>
        </div>
        <div className="tpl-body">
          <div className="tpl-list">
            {templates.map((t) => (
              <button
                key={t.id}
                className={`tpl-item${selId === t.id ? ' active' : ''}`}
                onClick={() => setSelId(t.id)}
                title={t.name}
              >
                {t.name}
              </button>
            ))}
            <button
              className={`tpl-item new${selId === 'new' ? ' active' : ''}`}
              onClick={() => setSelId('new')}
            >
              ＋ New template
            </button>
          </div>
          <div className="tpl-editor">
            <input
              className="tpl-name"
              placeholder="Template name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <textarea
              className="tpl-text"
              placeholder="Prompt body — injected into the session's input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              spellCheck={false}
            />
            <div className="tpl-actions">
              <button className="tbtn" onClick={save} disabled={!dirty || !name.trim() || !body.trim()}>
                {selId === 'new' ? 'Create' : 'Save'}
              </button>
              {selId !== 'new' && (
                <button className="tbtn danger" onClick={del}>
                  Delete
                </button>
              )}
              <button
                className="tbtn primary"
                style={{ marginLeft: 'auto' }}
                onClick={inject}
                disabled={!body.trim()}
                title="Paste this template into the session's prompt (you can edit before sending)"
              >
                Inject into session ▸
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
