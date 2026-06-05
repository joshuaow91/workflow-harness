import { useEffect, useRef } from 'react'
import { Annotation, EditorState } from '@codemirror/state'
import { EditorView, drawSelection, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { livePreview } from './livePreview'

const External = Annotation.define<boolean>()

const theme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'var(--text)', height: '100%' },
  '.cm-scroller': { fontFamily: 'inherit', fontSize: '14px', lineHeight: '1.7', overflow: 'auto' },
  '.cm-content': { padding: '20px 28px', maxWidth: '820px', margin: '0 auto', caretColor: 'var(--accent)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--surface-hover)' },
  '.cm-line': { padding: '0' }
})

// Obsidian-style live-preview markdown editor: type directly on the page,
// markdown rendered inline, raw syntax shown only on the cursor's line.
export function LivePreviewEditor({ doc, onChange }: { doc: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!ref.current) return
    const v = new EditorView({
      parent: ref.current,
      state: EditorState.create({
        doc,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          drawSelection(),
          EditorView.lineWrapping,
          markdown({ codeLanguages: languages }),
          syntaxHighlighting(defaultHighlightStyle),
          livePreview,
          theme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((t) => t.annotation(External)))
              onChangeRef.current(u.state.doc.toString())
          })
        ]
      })
    })
    view.current = v
    return () => v.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Replace the document when switching notes (don't fire onChange for it).
  useEffect(() => {
    const v = view.current
    if (!v || v.state.doc.toString() === doc) return
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: doc },
      annotations: External.of(true)
    })
  }, [doc])

  return <div className="cm-host" ref={ref} />
}
