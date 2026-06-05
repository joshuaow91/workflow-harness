import { useEffect, useState } from 'react'
import type { AgentInfo } from '@shared/types'
import { settingsStore, useSettings } from '../lib/settingsStore'
import { Dropdown } from '../components/Dropdown'

export function AgentPicker() {
  const settings = useSettings()
  const [agents, setAgents] = useState<(AgentInfo & { installed: boolean })[]>([])
  useEffect(() => {
    void window.api.agent.list().then(setAgents)
  }, [])

  const current = settings?.agent ?? 'claude'
  const sel = agents.find((a) => a.id === current)

  return (
    <section className="settings-section">
      <div className="settings-label">Coding agent</div>
      <Dropdown
        value={current}
        options={agents.map((a) => ({
          value: a.id,
          label: a.installed ? a.label : `${a.label} (not installed)`
        }))}
        onChange={(v) => void settingsStore.update({ agent: v })}
        minWidth={200}
      />
      <p className="settings-hint">
        Drives the sessions sidebar, resume, plan/PR sidebar, terminal launches, and MCP. Sessions,
        terminals, browser, GitHub and notes work the same regardless.
        {sel && !sel.installed && (
          <>
            {' '}
            <strong>{sel.label}</strong> isn’t installed (CLI: <code>{sel.cli}</code>).
          </>
        )}
      </p>
    </section>
  )
}
