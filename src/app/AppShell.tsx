import { useEffect, useState } from 'react'
import { Sidebar } from '../sidebar/Sidebar'
import { TerminalsTab } from '../panes/TerminalsTab'
import { WebWorkspace } from '../panes/WebWorkspace'
import { IssuesTab } from '../github/IssuesTab'
import { BoardTab } from '../github/BoardTab'
import { MyPRsTab } from '../github/MyPRsTab'
import { ReviewTab } from '../github/ReviewTab'
import { SettingsTab } from '../settings/SettingsTab'
import { ThemePicker } from '../themes/ThemePicker'
import { themeStore } from '../themes/themeStore'
import { useSettings } from '../lib/settingsStore'
import { terminalBus } from '../lib/terminalBus'

type TabId = 'terminals' | 'browser' | 'issues' | 'board' | 'myprs' | 'review' | 'settings'

interface TabDef {
  id: TabId
  label: string
  icon: string
}

const TABS: TabDef[] = [
  { id: 'terminals', label: 'Terminals', icon: '⌘' },
  { id: 'browser', label: 'Browser', icon: '◍' },
  { id: 'issues', label: 'Issues', icon: '◇' },
  { id: 'board', label: 'Board', icon: '▦' },
  { id: 'myprs', label: 'My PRs', icon: '⤴' },
  { id: 'review', label: 'Review', icon: '✓' }
]

function TabPanel({ tab }: { tab: Exclude<TabId, 'terminals' | 'browser'> }) {
  switch (tab) {
    case 'issues':
      return <IssuesTab />
    case 'board':
      return <BoardTab />
    case 'myprs':
      return <MyPRsTab />
    case 'review':
      return <ReviewTab />
    case 'settings':
      return <SettingsTab />
  }
}

export function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>('terminals')
  const settings = useSettings()

  // Jump to the Terminals tab whenever something requests a new terminal.
  useEffect(() => terminalBus.subscribe(() => setActiveTab('terminals')), [])

  // Apply the saved theme once settings load (and whenever it changes).
  useEffect(() => {
    if (settings?.themeName) themeStore.apply(settings.themeName)
  }, [settings?.themeName])

  return (
    <div className="shell">
      <div className="titlebar">
        <span className="brand">
          workflow<span className="brand-dot">·</span>harness
        </span>
        <div className="titlebar-right">
          <ThemePicker />
          <button
            className={`titlebar-gear${activeTab === 'settings' ? ' on' : ''}`}
            onClick={() => setActiveTab('settings')}
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </div>

      <Sidebar />

      <div className="main">
        <div className="tabbar">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab${t.id === activeTab ? ' active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              <span className="tab-icon">{t.icon}</span>
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
