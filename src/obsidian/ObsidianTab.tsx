import { useEffect, useMemo, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { marked } from 'marked'
import { useAsync } from '../lib/useAsync'
import { settingsStore, useSettings } from '../lib/settingsStore'

function renderMarkdown(md: string): string {
  const pre = md
    .replace(/!\[\[([^\]]+)\]\]/g, '<em>[[$1]]</em>')
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
  const [q, setQ] = useState('')
  const [saved, setSaved] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!sel && list.length) setSel(list[0].path)
  }, [list, sel])

  // Load the selected note. Flush any pending save for the previous note first.
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (sel)
      void window.api.obsidian.readNote(sel).then((c) => {
        setContent(c)
        setSaved(true)
      })
  }, [sel])

  // Auto-save (debounced) on every edit — no Save button.
  const onEdit = (v: string): void => {
    setContent(v)
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const path = sel
    saveTimer.current = setTimeout(() => {
      if (path)
        void window.api.obsidian.saveNote(path, v).then(() => {
          setSaved(true)
          notes.reload()
        })
    }, 600)
  }

  const openByTitle = (title: string): void => {
    const n = list.find((x) => x.title.toLowerCase() === title.toLowerCase())
    if (n) setSel(n.path)
  }
  const onClickContent = (e: React.MouseEvent): void => {
    const a = (e.target as HTMLElement).closest('[data-wikilink]')
    if (a) {
      e.preventDefault()
      openByTitle(decodeURIComponent(a.getAttribute('data-wikilink') ?? ''))
    }
  }

  const html = useMemo(() => renderMarkdown(content), [content])

  const chooseVault = async (): Promise<void> => {
    const p = await window.api.system.pickDirectory()
    if (p) await settingsStore.update({ obsidianVault: p })
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
        <Panel defaultSize={20} minSize={12}>
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
        <Panel defaultSize={40} minSize={20}>
          <div className="obs-view">
            <div className="obs-viewbar">
              <span className="obs-viewtitle">{sel ?? 'No note selected'}</span>
              <span className="obs-saved">{saved ? 'saved' : 'saving…'}</span>
            </div>
            <textarea
              className="obs-edit"
              value={content}
              spellCheck={false}
              onChange={(e) => onEdit(e.target.value)}
              disabled={!sel}
            />
          </div>
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel defaultSize={40} minSize={20}>
          <div className="obs-view">
            <div className="obs-viewbar">
              <span className="obs-viewtitle">Preview</span>
            </div>
            <div className="obs-md" onClick={onClickContent} dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
