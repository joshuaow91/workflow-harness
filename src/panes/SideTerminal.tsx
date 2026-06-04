import { useState } from 'react'
import type { TerminalSpawnOptions } from '@shared/types'
import { useFlatSessions } from '../sidebar/useFlatSessions'
import { useDefaultSessionDir } from '../lib/settingsStore'
import { Dropdown, type DropdownOption } from '../components/Dropdown'
import { TerminalPane } from './TerminalPane'

function basename(p: string): string {
  return p.split('/').filter(Boolean).pop() ?? p
}

// A terminal pane with a session picker: resume any recent claude session or
// start a fresh claude/shell in the configured default directory.
export function SideTerminal({ onClose }: { onClose?: () => void }) {
  const sessions = useFlatSessions()
  const defaultDir = useDefaultSessionDir()
  const [opts, setOpts] = useState<TerminalSpawnOptions | null>(null)
  const [mountKey, setMountKey] = useState(0)

  const launch = (next: TerminalSpawnOptions): void => {
    setOpts(next)
    setMountKey((k) => k + 1)
  }

  const onSelect = (value: string): void => {
    if (value === '__shell') launch({ cwd: defaultDir, label: `shell · ${basename(defaultDir)}` })
    else if (value === '__claude')
      launch({ cwd: defaultDir, initialCommand: 'claude', label: `claude · ${basename(defaultDir)}` })
    else {
      const s = sessions.find((x) => x.sessionId === value)
      if (s) launch({ cwd: s.cwd, initialCommand: `claude --resume ${s.sessionId}`, label: s.title })
    }
  }

  const dirName = basename(defaultDir)
  const options: DropdownOption[] = [
    { value: '__claude', label: `＋ new claude`, sublabel: dirName },
    { value: '__shell', label: `＋ shell`, sublabel: dirName },
    ...sessions.slice(0, 60).map((s) => ({
      value: s.sessionId,
      label: `${s.live ? '● ' : ''}${s.title}`,
      sublabel: s.projectName
    }))
  ]

  return (
    <div className="side-term">
      <div className="side-term-head">
        <Dropdown
          value=""
          triggerLabel={opts?.label ?? 'Pick a session…'}
          options={options}
          onChange={onSelect}
          searchable
          minWidth={240}
        />
        {onClose && (
          <button className="term-act" title="Close pane" onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      <div className="side-term-body">
        {opts ? (
          <TerminalPane key={mountKey} opts={opts} />
        ) : (
          <div className="side-term-hint">Pick a session to resume, or start a new claude.</div>
        )}
      </div>
    </div>
  )
}
