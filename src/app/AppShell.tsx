import { useEffect, useRef, useState } from 'react'
import { Sidebar } from '../sidebar/Sidebar'
import { TerminalsTab } from '../panes/TerminalsTab'
import { WebWorkspace } from '../panes/WebWorkspace'
import { IssuesTab } from '../github/IssuesTab'
import { MyPRsTab } from '../github/MyPRsTab'
import { DiffTab } from '../diff/DiffTab'
import { DiffModal } from '../diff/DiffModal'
import { diffBus } from '../lib/diffBus'
import { DatadogTab } from '../datadog/DatadogTab'
import { DeployWatchTab } from '../datadog/DeployWatchTab'
import { ObsidianTab } from '../obsidian/ObsidianTab'
import { MongoTab } from '../mongo/MongoTab'
import { KnowledgeTab } from '../knowledge/KnowledgeTab'
import { SettingsTab } from '../settings/SettingsTab'
import { SetupModal } from './SetupModal'
import { CommandPalette } from './CommandPalette'
import { HeaderStats } from './HeaderStats'
import { ThemePicker } from '../themes/ThemePicker'
import { themeStore } from '../themes/themeStore'
import { Icon } from '../components/Icon'
import { useSettings } from '../lib/settingsStore'
import { terminalBus } from '../lib/terminalBus'
import { browserRouter } from '../lib/browserRouter'

type TabId =
  | 'terminals'
  | 'browser'
  | 'issues'
  | 'myprs'
  | 'changes'
  | 'datadog'
  | 'deploys'
  | 'mongo'
  | 'knowledge'
  | 'settings'

interface TabDef {
  id: TabId
  label: string
  icon: string
}

const TABS: TabDef[] = [
  { id: 'terminals', label: 'Terminals', icon: 'terminal' },
  { id: 'browser', label: 'Browser', icon: 'globe' },
  { id: 'issues', label: 'Issues', icon: 'issue' },
  { id: 'myprs', label: 'My PRs', icon: 'pr' },
  { id: 'changes', label: 'Diff', icon: 'diff' },
  { id: 'datadog', label: 'Datadog', icon: 'chart' },
  { id: 'deploys', label: 'Deploys', icon: 'rocket' },
  { id: 'mongo', label: 'Mongo', icon: 'database' },
  { id: 'knowledge', label: 'Knowledge', icon: 'graph' }
]

function TabPanel({ tab }: { tab: Exclude<TabId, 'terminals' | 'browser' | 'changes'> }) {
  switch (tab) {
    case 'issues':
      return <IssuesTab />
    case 'myprs':
      return <MyPRsTab />
    case 'datadog':
      return <DatadogTab />
    case 'deploys':
      return <DeployWatchTab />
    case 'mongo':
      return <MongoTab />
    case 'knowledge':
      return <KnowledgeTab />
    case 'settings':
      return <SettingsTab />
  }
}

export function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const saved = localStorage.getItem('harness:activeTab')
    // 'notes' is no longer a tab (it's the right sidebar) — don't restore it.
    return saved && saved !== 'notes' ? (saved as TabId) : 'terminals'
  })
  useEffect(() => {
    localStorage.setItem('harness:activeTab', activeTab)
    // The Terminals tab stays mounted but display:none when hidden; returning to
    // it leaves xterm un-painted (blank). Nudge a refit/repaint on the way back.
    if (activeTab === 'terminals') {
      const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 50)
      return () => clearTimeout(t)
    }
  }, [activeTab])

  // Notes live in a collapsible right sidebar, toggled from the titlebar.
  const [notesOpen, setNotesOpen] = useState(() => localStorage.getItem('harness:notesOpen') === '1')
  const notesVisited = useRef(notesOpen) // mount the editor once, keep it alive
  if (notesOpen) notesVisited.current = true
  useEffect(() => {
    localStorage.setItem('harness:notesOpen', notesOpen ? '1' : '0')
  }, [notesOpen])

  const [notesWidth, setNotesWidth] = useState(
    () => Number(localStorage.getItem('harness:notesWidth')) || 460
  )
  useEffect(() => {
    localStorage.setItem('harness:notesWidth', String(notesWidth))
  }, [notesWidth])

  // Drag the notes panel's left edge to resize (panel is pinned to the right).
  const startNotesResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    const onMove = (ev: MouseEvent): void =>
      setNotesWidth(
        Math.min(Math.max(window.innerWidth - ev.clientX, 280), Math.round(window.innerWidth * 0.7))
      )
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  const [setupOpen, setSetupOpen] = useState(false)
  const [diffModal, setDiffModal] = useState<{ path: string; title: string } | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const settings = useSettings()

  // ⌘K / Ctrl+K opens the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Sidebar diff shortcuts: focus the Changes tab, or pop a quick diff modal.
  useEffect(() => diffBus.onTab(() => setActiveTab('changes')), [])
  useEffect(() => diffBus.onModal((path, title) => setDiffModal({ path, title })), [])

  // Jump to the Terminals tab whenever something requests a new terminal.
  useEffect(() => terminalBus.subscribe(() => setActiveTab('terminals')), [])

  // Embedded webviews asking to open a link in a new tab -> route to the view it
  // came from (e.g. the Issues tab opens it in its own tab strip), else fall back
  // to the Browser workspace. Never yanks you off the current app tab.
  useEffect(
    () => window.api.browser.onOpenTab(({ url, sourceId }) => browserRouter.dispatch(url, sourceId)),
    []
  )

  // Apply the saved theme once settings load (and whenever it changes).
  useEffect(() => {
    if (settings?.themeName) themeStore.apply(settings.themeName)
  }, [settings?.themeName])

  return (
    <div
      className={`shell${notesOpen ? ' notes-open' : ''}`}
      style={{ ['--notes-w']: `${notesWidth}px` } as React.CSSProperties}
    >
      <div className="titlebar">
        <span className="brand">
          blink<span className="brand-dot">·</span>workflow
        </span>
        <div className="titlebar-right">
          <HeaderStats onNav={(t) => setActiveTab(t as TabId)} />
          <ThemePicker />
          <button
            className={`titlebar-gear${notesOpen ? ' on' : ''}`}
            onClick={() => setNotesOpen((o) => !o)}
            title="Notes"
          >
            <Icon name="notebook" size={15} />
          </button>
          <button
            className="titlebar-gear"
            onClick={() => setSetupOpen(true)}
            title="Setup & requirements"
          >
            <Icon name="help" size={15} />
          </button>
          <button
            className={`titlebar-gear${activeTab === 'settings' ? ' on' : ''}`}
            onClick={() => setActiveTab('settings')}
            title="Settings"
          >
            <Icon name="cog" size={15} />
          </button>
        </div>
      </div>
      {setupOpen && <SetupModal onClose={() => setSetupOpen(false)} />}
      {diffModal && (
        <DiffModal path={diffModal.path} title={diffModal.title} onClose={() => setDiffModal(null)} />
      )}
      {paletteOpen && (
        <CommandPalette
          tabs={TABS.map((t) => ({ id: t.id, label: t.label }))}
          navigate={(t) => setActiveTab(t as TabId)}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      <Sidebar />

      <div className="main">
        <div className="tabbar">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab${t.id === activeTab ? ' active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              <span className="tab-icon">
                <Icon name={t.icon} />
              </span>
              {t.label}
            </button>
          ))}
        </div>
        <div className="tab-content">
          {/* Terminals + browser stay mounted so PTYs and page state survive tab switches. */}
          <div className="tab-layer" style={{ display: activeTab === 'terminals' ? 'block' : 'none' }}>
            <TerminalsTab />
          </div>
          <div className="tab-layer" style={{ display: activeTab === 'browser' ? 'block' : 'none' }}>
            <WebWorkspace />
          </div>
          {/* Diff stays mounted so the embedded hunk pty survives tab switches. */}
          <div className="tab-layer" style={{ display: activeTab === 'changes' ? 'block' : 'none' }}>
            <DiffTab active={activeTab === 'changes'} />
          </div>
          {activeTab !== 'terminals' && activeTab !== 'browser' && activeTab !== 'changes' && (
            <TabPanel tab={activeTab} />
          )}
        </div>
      </div>

      <aside className="notes-panel" style={{ display: notesOpen ? 'flex' : 'none' }}>
        <div className="notes-resize" onMouseDown={startNotesResize} title="Drag to resize" />
        {notesVisited.current && <ObsidianTab />}
      </aside>
    </div>
  )
}
