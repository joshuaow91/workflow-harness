import { useEffect, useState } from 'react'
import { Sidebar } from '../sidebar/Sidebar'
import { TerminalsTab } from '../panes/TerminalsTab'
import { BrowserPane } from '../panes/BrowserPane'
import { IssuesTab } from '../github/IssuesTab'
import { BoardTab } from '../github/BoardTab'
import { MyPRsTab } from '../github/MyPRsTab'
import { ReviewTab } from '../github/ReviewTab'
import { terminalBus } from '../lib/terminalBus'

type TabId = 'terminals' | 'browser' | 'issues' | 'board' | 'myprs' | 'review'

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
  }
}

export function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>('terminals')

  // Jump to the Terminals tab whenever something requests a new terminal.
  useEffect(() => terminalBus.subscribe(() => setActiveTab('terminals')), [])

  return (
    <div className="shell">
      <div className="titlebar">
        <span className="brand">
          workflow<span className="brand-dot">·</span>harness
        </span>
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
            <BrowserPane />
          </div>
          {activeTab !== 'terminals' && activeTab !== 'browser' && <TabPanel tab={activeTab} />}
        </div>
      </div>
    </div>
  )
}
