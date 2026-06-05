import { useEffect, useMemo, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { marked } from 'marked'
import type { ObsidianTheme } from '@shared/types'
import { useAsync } from '../lib/useAsync'
import { settingsStore, useSettings } from '../lib/settingsStore'
import { LivePreviewEditor } from './LivePreviewEditor'
import { ReadingView } from './ReadingView'
import { applyThemeVars, clearThemeVars, extractThemeVars } from './obsidianTheme'

function renderNote(md: string): string {
  const pre = md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, name: string, alias?: string) => {
    const label = (alias ?? name).trim()
    return `<a href="#" data-wikilink="${encodeURIComponent(name.trim())}">${label}</a>`
  })
  return marked.parse(pre, { gfm: true, async: false }) as string
}

function toggleNthTask(md: string, idx: number): string {
  let i = 0
  return md.replace(/^(\s*[-*+] )\[( |x|X)\]/gm, (m, pre: string, c: string) =>
    i++ === idx ? `${pre}[${c === ' ' ? 'x' : ' '}]` : m
  )
}

export function ObsidianTab() {
  const settings = useSettings()
  const vault = settings?.obsidianVault
  const notes = useAsync(() => (vault ? window.api.obsidian.listNotes() : Promise.resolve([])), [vault])
  const list = notes.data ?? []

  const [sel, setSel] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [q, setQ] = useState('')
  const [saved, setSaved] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [mode, setMode] = useState<'edit' | 'read'>('read')
  const [theme, setTheme] = useState<ObsidianTheme | null>(null)
  const useTheme = settings?.useObsidianTheme !== false
  const themeVars = useMemo(
    () => (theme?.css ? extractThemeVars(theme.css, theme.scheme) : {}),
    [theme]
  )
  const html = useMemo(() => (mode === 'read' ? renderNote(content) : ''), [content, mode])
  const toggleTask = (idx: number): void => onEdit(toggleNthTask(content, idx))
  useEffect(() => {
    if (vault) void window.api.obsidian.theme().then(setTheme)
  }, [vault])
  useEffect(() => {
    if (useTheme && theme?.css) applyThemeVars(extractThemeVars(theme.css, theme.scheme))
    else clearThemeVars()
    return () => clearThemeVars()
  }, [useTheme, theme])
  const themed = useTheme && !!theme?.css

  useEffect(() => {
    if (!sel && list.length) setSel(list[0].path)
  }, [list, sel])

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (sel)
      void window.api.obsidian.readNote(sel).then((c) => {
        setContent(c)
        setSaved(true)
      })
    else setContent('')
  }, [sel])

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

  const newNote = async (): Promise<void> => {
    const path = await window.api.obsidian.createNote('Untitled')
    await notes.reload()
    setSel(path)
  }
  const deleteNote = async (path: string): Promise<void> => {
    if (!window.confirm(`Delete "${path}"? This cannot be undone.`)) return
    await window.api.obsidian.deleteNote(path)
    if (sel === path) setSel(null)
    await notes.reload()
  }

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
      <PanelGroup direction="horizontal" autoSaveId="obs-h2">
        <Panel defaultSize={22} minSize={14}>
          <div className="obs-listcol">
            <div className="obs-listbar">
              <input
                className="dd-search"
                placeholder="Search notes…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button className="term-act" title="New note" onClick={() => void newNote()}>
                ＋
              </button>
              <button className="term-act" title="Refresh" onClick={() => notes.reload()}>
                ↻
              </button>
            </div>
            <div className="obs-list">
              {notes.loading && <div className="side-term-hint">Loading notes…</div>}
              {filtered.map((n) => (
                <div
                  key={n.path}
                  className={`obs-item${sel === n.path ? ' sel' : ''}`}
                  onClick={() => setSel(n.path)}
                  title={n.path}
                >
                  <span className="obs-item-main">
                    <span className="obs-item-title">{n.title}</span>
                    {n.folder && <span className="obs-item-folder">{n.folder}</span>}
                  </span>
                  <button
                    className="obs-item-del"
                    title="Delete note"
                    onClick={(e) => {
                      e.stopPropagation()
                      void deleteNote(n.path)
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel defaultSize={78} minSize={30}>
          <div className="obs-view">
            <div className="obs-viewbar">
              <span className="obs-viewtitle">{sel ?? 'No note selected'}</span>
              <button className="tbtn" onClick={() => setMode((m) => (m === 'read' ? 'edit' : 'read'))}>
                {mode === 'read' ? '✎ Edit' : '📖 Read'}
              </button>
              {theme?.css && (
                <button
                  className={`tbtn${themed ? ' connected' : ''}`}
                  title={theme.name ?? 'Obsidian theme'}
                  onClick={() => void settingsStore.update({ useObsidianTheme: !useTheme })}
                >
                  {themed ? `✓ ${theme.name}` : `Use ${theme.name}`}
                </button>
              )}
              <span className="obs-saved">{saved ? 'saved' : 'saving…'}</span>
            </div>
            {sel ? (
              mode === 'read' ? (
                <div className="obs-reading">
                  <ReadingView
                    html={html}
                    themeCss={themed ? (theme?.css ?? '') : ''}
                    scheme={theme?.scheme ?? 'dark'}
                    vars={themed ? themeVars : {}}
                    onToggleTask={toggleTask}
                  />
                </div>
              ) : (
                <div className={`obs-editor${themed ? ` obs-theme-scope theme-${theme!.scheme}` : ''}`}>
                  <LivePreviewEditor doc={content} onChange={onEdit} />
                </div>
              )
            ) : (
              <div className="side-term-hint" style={{ padding: 24 }}>
                Select a note, or press ＋ to create one.
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
