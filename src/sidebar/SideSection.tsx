import { useState, type ReactNode } from 'react'

interface SideSectionProps {
  title: string
  count?: number
  defaultOpen?: boolean
  children: ReactNode
}

export function SideSection({ title, count, defaultOpen = true, children }: SideSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="side-section">
      <button className="side-section-header" onClick={() => setOpen((v) => !v)}>
        <span className={`chev${open ? '' : ' collapsed'}`}>▼</span>
        {title}
        {count !== undefined && <span className="count">{count}</span>}
      </button>
      {open && <div className="side-list">{children}</div>}
    </div>
  )
}
