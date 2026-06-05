import { useEffect, useState } from 'react'
import { Sidebar } from '../sidebar/Sidebar'
import { TerminalsTab } from '../panes/TerminalsTab'
import { WebWorkspace } from '../panes/WebWorkspace'
import { IssuesTab } from '../github/IssuesTab'
import { MyPRsTab } from '../github/MyPRsTab'
import { ReviewTab } from '../github/ReviewTab'
import { DiffTab } from '../diff/DiffTab'
import { DiffModal } from '../diff/DiffModal'
import { diffBus } from '../lib/diffBus'
import { DatadogTab } from '../datadog/DatadogTab'
import { ObsidianTab } from '../obsidian/ObsidianTab'
import { MermaidTab } from '../mermaid/MermaidTab'
import { MongoTab } from '../mongo/MongoTab'
import { KnowledgeTab } from '../knowledge/KnowledgeTab'
import { SettingsTab } from '../settings/SettingsTab'
import { SetupModal } from './SetupModal'
import { CommandPalette } from './CommandPalette'
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
  | 'review'
  | 'changes'
  | 'datadog'
  | 'notes'
  | 'mermaid'
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
  { id: 'review', label: 'Review', icon: 'check' },
  { id: 'changes', label: 'Changes', icon: 'diff' },
  { id: 'datadog', label: 'Datadog', icon: 'chart' },
  { id: 'notes', label: 'Notes', icon: 'notebook' },
  { id: 'mermaid', label: 'Diagram', icon: 'diagram' },
  { id: 'mongo', label: 'Mongo', icon: 'database' },
  { id: 'knowledge', label: 'Knowledge', icon: 'graph' }
]

function TabPanel({ tab }: { tab: Exclude<TabId, 'terminals' | 'browser'> }) {
  switch (tab) {
    case 'issues':
      return <IssuesTab />
    case 'myprs':
      return <MyPRsTab />
    case 'review':
      return <ReviewTab />
    case 'changes':
      return <DiffTab />
    case 'datadog':
      return <DatadogTab />
    case 'notes':
      return <ObsidianTab />
    case 'mermaid':
      return <MermaidTab />
    case 'mongo':
      return <MongoTab />
    case 'knowledge':
      return <KnowledgeTab />
    case 'settings':
      return <SettingsTab />
  }
}

export function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>(
    () => (localStorage.getItem('harness:activeTab') as TabId) || 'terminals'
  )
  useEffect(() => {
    localStorage.setItem('harness:activeTab', activeTab)
  }, [activeTab])
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
    <div className="shell">
      <div className="titlebar">
        <span className="brand">
          blink<span className="brand-dot">·</span>workflow
        </span>
        <div className="titlebar-right">
          <ThemePicker />
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
            <Icon name="settings" size={15} />
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
          {activeTab !== 'terminals' && activeTab !== 'browser' && <TabPanel tab={activeTab} />}
        </div>
      </div>
    </div>
  )
}
