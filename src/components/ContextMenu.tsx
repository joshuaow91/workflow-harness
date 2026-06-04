import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuItem {
  label: string
  danger?: boolean
  onClick: () => void
}

export function ContextMenu({
  x,
  y,
  items,
  onClose
}: {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}) {
  useEffect(() => {
    const close = (): void => onClose()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    // Defer so the opening contextmenu event doesn't immediately close it.
    const t = setTimeout(() => {
      document.addEventListener('mousedown', close)
      document.addEventListener('contextmenu', close)
    }, 0)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', close)
      document.removeEventListener('contextmenu', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div className="ctx-menu" style={{ top: y, left: x }}>
      {items.map((item) => (
        <button
          key={item.label}
          className={`ctx-item${item.danger ? ' danger' : ''}`}
          onClick={() => {
            item.onClick()
            onClose()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  )
}
