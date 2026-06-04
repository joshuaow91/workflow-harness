import { useState } from 'react'
import { Sidebar } from '../sidebar/Sidebar'

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

function Placeholder({ emoji, title, sub }: { emoji: string; title: string; sub: string }) {
  return (
    <div className="placeholder">
      <div className="ph-emoji">{emoji}</div>
      <div className="ph-title">{title}</div>
      <div className="ph-sub">{sub}</div>
    </div>
  )
}

function TabPanel({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'terminals':
      return <Placeholder emoji="⌨️" title="Terminals" sub="Split panes running the claude CLI land here (step 3)." />
    case 'browser':
      return <Placeholder emoji="🌐" title="Browser" sub="An embedded web browser pane lands here (step 5)." />
    case 'issues':
      return <Placeholder emoji="◇" title="GitHub Issues" sub="Issues for the selected repo, via the gh CLI (step 6)." />
    case 'board':
      return <Placeholder emoji="▦" title="Project Board" sub="Your assigned Projects v2 board, via gh GraphQL (step 6)." />
    case 'myprs':
      return <Placeholder emoji="⤴" title="My Pull Requests" sub="PRs you authored, via the gh CLI (step 6)." />
    case 'review':
      return <Placeholder emoji="✓" title="Review Requests" sub="PRs awaiting your review, via the gh CLI (step 6)." />
  }
}

export function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>('terminals')

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
          <TabPanel tab={activeTab} />
        </div>
      </div>
    </div>
  )
}
