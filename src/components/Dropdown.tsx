import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

export interface DropdownOption {
  value: string
  label: string
  swatch?: string
  sublabel?: string
}

interface DropdownProps {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  searchable?: boolean
  placeholder?: string
  align?: 'left' | 'right'
  minWidth?: number
  /** Show this instead of the selected option's label on the trigger. */
  triggerLabel?: ReactNode
  className?: string
}

export function Dropdown({
  value,
  options,
  onChange,
  searchable = false,
  placeholder = 'Select…',
  align = 'left',
  minWidth = 160,
  triggerLabel,
  className
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const current = options.find((o) => o.value === value)
  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options

  useLayoutEffect(() => {
    if (open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      const width = Math.max(r.width, minWidth)
      setPos({ top: r.bottom + 4, left: align === 'right' ? r.right - width : r.left, width })
      setActive(Math.max(0, filtered.findIndex((o) => o.value === value)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (
        !panelRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    // Close when the page *behind* the panel scrolls (the fixed panel would
    // detach from its trigger) — but ignore scrolls inside the panel's own list,
    // which fire from scrollIntoView when the menu opens.
    const onScroll = (e: Event): void => {
      if (panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onResize = (): void => setOpen(false)
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const choose = (v: string): void => {
    onChange(v)
    setOpen(false)
    setQuery('')
  }

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(filtered.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filtered[active]
      if (opt) choose(opt.value)
    }
  }

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('.dd-option.active')?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  return (
    <div className={`dd${className ? ' ' + className : ''}`}>
      <button
        ref={triggerRef}
        className="dd-trigger"
        onClick={() => setOpen((o) => !o)}
        title={current?.label}
      >
        {current?.swatch && <span className="dd-swatch" style={{ background: current.swatch }} />}
        <span className="dd-value">{triggerLabel ?? current?.label ?? placeholder}</span>
        <span className="dd-caret"><Icon name="caret" size={12} /></span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            className="dd-panel"
            style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
            onKeyDown={onKey}
          >
            {searchable && (
              <input
                autoFocus
                className="dd-search"
                placeholder="Search…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
              />
            )}
            <div className="dd-list" ref={listRef}>
              {filtered.length === 0 && <div className="dd-empty">No matches</div>}
              {filtered.map((o, i) => (
                <button
                  key={o.value}
                  className={`dd-option${o.value === value ? ' sel' : ''}${i === active ? ' active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o.value)}
                >
                  {o.swatch && <span className="dd-swatch" style={{ background: o.swatch }} />}
                  <span className="dd-opt-label">{o.label}</span>
                  {o.sublabel && <span className="dd-opt-sub">{o.sublabel}</span>}
                  {o.value === value && <span className="dd-check">✓</span>}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
