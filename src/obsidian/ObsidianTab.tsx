import { useEffect, useRef, useState } from 'react'
import { useAsync } from '../lib/useAsync'
import { settingsStore, useSettings } from '../lib/settingsStore'
import { Dropdown } from '../components/Dropdown'
import { Icon } from '../components/Icon'
import { WysiwygEditor } from './WysiwygEditor'

export function ObsidianTab() {
  const settings = useSettings()
  const vault = settings?.obsidianVault
  const notes = useAsync(() => (vault ? window.api.obsidian.listNotes() : Promise.resolve([])), [vault])
  const list = notes.data ?? []

  const [sel, setSel] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [ready, setReady] = useState(false)
  const [q, setQ] = useState('')
  const [saved, setSaved] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!sel && list.length) setSel(list[0].path)
  }, [list, sel])

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setReady(false)
    if (sel)
      void window.api.obsidian.readNote(sel).then((c) => {
        setContent(c)
        setSaved(true)
        setReady(true)
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
    }, 700)
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
  const current = list.find((n) => n.path === sel)

  return (
    <div className="obs-tab obs-single">
      <div className="obs-toolbar">
        <input
          className="obs-search"
          placeholder="Search notes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="obs-selectrow">
          <Dropdown
            className="obs-noteselect"
            value={sel ?? ''}
            triggerLabel={current?.title ?? 'Select a note…'}
            options={filtered.map((n) => ({ value: n.path, label: n.title, sublabel: n.folder }))}
            onChange={(v) => setSel(v)}
            minWidth={200}
          />
          <button className="obs-btn" title="New note" onClick={() => void newNote()}>
            <Icon name="plus" size={17} />
          </button>
          <button className="obs-btn" title="Refresh" onClick={() => notes.reload()}>
            <Icon name="refresh" size={16} />
          </button>
          {sel && (
            <button className="obs-btn" title="Delete note" onClick={() => void deleteNote(sel)}>
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="obs-view">
        <div className="obs-viewbar">
          <span className="obs-viewtitle" title={sel ?? undefined}>
            {current?.title ?? sel ?? 'No note selected'}
          </span>
          <span className="obs-saved">{saved ? 'saved' : 'saving…'}</span>
        </div>
        {sel && ready ? (
          <div className="obs-editor">
            <WysiwygEditor key={sel} doc={content} onChange={onEdit} />
          </div>
        ) : (
          <div className="side-term-hint" style={{ padding: 24 }}>
            {sel ? 'Loading…' : 'Select a note, or press ＋ to create one.'}
          </div>
        )}
      </div>
    </div>
  )
}
