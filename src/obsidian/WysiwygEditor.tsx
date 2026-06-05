import { useEffect, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame-dark.css'

// Polished WYSIWYG markdown editor (Milkdown Crepe) over the plain .md vault.
// Markdown in / markdown out, so files round-trip cleanly. Remount (via key) to
// load a different note.
export function WysiwygEditor({ doc, onChange }: { doc: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!ref.current) return
    let crepe: Crepe | null = null
    let destroyed = false
    crepe = new Crepe({ root: ref.current, defaultValue: doc })
    void crepe.create().then(() => {
      if (destroyed || !crepe) return
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => onChangeRef.current(markdown))
      })
    })
    return () => {
      destroyed = true
      crepe?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div className="milkdown-host" ref={ref} />
}
