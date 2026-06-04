import { SideSection } from './SideSection'

// Step 1: structural shell only. Step 2 wires the Projects/Sessions tree to
// ClaudeStore over IPC; step 4 wires the Repos/Worktrees tree.
export function Sidebar() {
  return (
    <div className="sidebar">
      <SideSection title="Projects">
        <div className="side-empty">Sessions from ~/.claude appear here (step 2).</div>
      </SideSection>
      <SideSection title="Repos">
        <div className="side-empty">Repos &amp; worktrees appear here (step 4).</div>
      </SideSection>
    </div>
  )
}
