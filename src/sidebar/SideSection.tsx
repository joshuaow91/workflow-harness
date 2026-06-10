import { useState, type ReactNode } from 'react'

interface SideSectionProps {
  title: string
  count?: number
  defaultOpen?: boolean
  /** Optional control rendered on the right of the title row (e.g. a refresh icon). */
  action?: ReactNode
  children: ReactNode
}

export function SideSection({ title, count, defaultOpen = true, action, children }: SideSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="side-section">
      <div className="side-section-row">
        <button className="side-section-header" onClick={() => setOpen((v) => !v)}>
          <span className={`chev${open ? '' : ' collapsed'}`}>▼</span>
          {title}
          {count !== undefined && <span className="count">{count}</span>}
        </button>
        {action && <span className="side-section-action">{action}</span>}
      </div>
      {open && <div className="side-list">{children}</div>}
    </div>
  )
}
