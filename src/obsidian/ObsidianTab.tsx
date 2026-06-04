import { useEffect, useMemo, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { marked } from 'marked'
import { useAsync } from '../lib/useAsync'
import { settingsStore, useSettings } from '../lib/settingsStore'

function renderMarkdown(md: string): string {
  const pre = md
    // image/file embeds -> placeholder for v1
    .replace(/!\[\[([^\]]+)\]\]/g, '<em>[[$1]]</em>')
    // [[note]] and [[note|alias]] wikilinks
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, name: string, alias?: string) => {
      const label = (alias ?? name).trim()
      return `<a href="#" data-wikilink="${encodeURIComponent(name.trim())}">${label}</a>`
    })
  return marked.parse(pre, { gfm: true, async: false }) as string
}

export function ObsidianTab() {
  const settings = useSettings()
  const vault = settings?.obsidianVault
  const notes = useAsync(
    () => (vault ? window.api.obsidian.listNotes() : Promise.resolve([])),
    [vault]
  )
  const list = notes.data ?? []

  const [sel, setSel] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!sel && list.length) setSel(list[0].path)
  }, [list, sel])

  useEffect(() => {
    if (sel)
      void window.api.obsidian.readNote(sel).then((c) => {
        setContent(c)
        setDraft(c)
        setEditing(false)
      })
  }, [sel])

  const openByTitle = (title: string): void => {
    const n = list.find((x) => x.title.toLowerCase() === title.toLowerCase())
    if (n) setSel(n.path)
  }

  const html = useMemo(() => renderMarkdown(content), [content])

  const onClickContent = (e: React.MouseEvent): void => {
    const a = (e.target as HTMLElement).closest('[data-wikilink]')
    if (a) {
      e.preventDefault()
      openByTitle(decodeURIComponent(a.getAttribute('data-wikilink') ?? ''))
    }
  }

  const chooseVault = async (): Promise<void> => {
    const p = await window.api.system.pickDirectory()
    if (p) await settingsStore.update({ obsidianVault: p })
  }

  const save = async (): Promise<void> => {
    if (!sel) return
    await window.api.obsidian.saveNote(sel, draft)
    setContent(draft)
    setEditing(false)
    notes.reload()
  }

  if (!vault) {
    return (
      <div className="placeholder">
        <div className="ph-emoji">📓</div>
        <div className="ph-title">Choose your Obsidian vault</div>
        <div className="ph-sub">Pick the vault folder to read and edit your notes here.</div>
        <button className="tbtn" onClick={chooseVault}>
          Choose vault…
        </button>
      </div>
    )
  }

  const filtered = q ? list.filter((n) => n.title.toLowerCase().includes(q.toLowerCase())) : list

  return (
    <div className="obs-tab">
      <PanelGroup direction="horizontal" autoSaveId="obs-h">
        <Panel defaultSize={24} minSize={15}>
          <div className="obs-listcol">
            <div className="obs-listbar">
              <input
                className="dd-search"
                placeholder="Search notes…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button className="term-act" title="Refresh" onClick={() => notes.reload()}>
                ↻
              </button>
            </div>
            <div className="obs-list">
              {notes.loading && <div className="side-term-hint">Loading notes…</div>}
              {filtered.map((n) => (
                <button
                  key={n.path}
                  className={`obs-item${sel === n.path ? ' sel' : ''}`}
                  onClick={() => setSel(n.path)}
                  title={n.path}
                >
                  <span className="obs-item-title">{n.title}</span>
                  {n.folder && <span className="obs-item-folder">{n.folder}</span>}
                </button>
              ))}
            </div>
          </div>
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel defaultSize={76} minSize={30}>
          <div className="obs-view">
            <div className="obs-viewbar">
              <span className="obs-viewtitle">{sel ?? 'No note selected'}</span>
              {editing ? (
                <>
                  <button className="tbtn" onClick={save}>
                    Save
                  </button>
                  <button
                    className="term-act"
                    title="Discard"
                    onClick={() => {
                      setEditing(false)
                      setDraft(content)
                    }}
                  >
                    ✕
                  </button>
                </>
              ) : (
                sel && (
                  <button className="tbtn" onClick={() => setEditing(true)}>
                    Edit
                  </button>
                )
              )}
            </div>
            {editing ? (
              <textarea
                className="obs-edit"
                value={draft}
                spellCheck={false}
                onChange={(e) => setDraft(e.target.value)}
              />
            ) : (
              <div className="obs-md" onClick={onClickContent} dangerouslySetInnerHTML={{ __html: html }} />
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
