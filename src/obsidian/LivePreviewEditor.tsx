import { useEffect, useRef } from 'react'
import { Annotation, EditorState } from '@codemirror/state'
import { EditorView, drawSelection, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { livePreview } from './livePreview'

const External = Annotation.define<boolean>()

// Fallback styling (used when no theme, and as a base the theme overrides).
// Lives inside the shadow root; uses harness CSS vars (custom props inherit
// across the shadow boundary).
const BASE_CSS = `
.cm-editor { background: transparent; color: var(--text); height: 100%; }
.cm-editor.cm-focused { outline: none; }
.cm-scroller { font-family: inherit; font-size: 15px; line-height: 1.7; overflow: auto; }
.cm-content { padding: 22px 32px; max-width: 860px; margin: 0 auto; caret-color: var(--accent); }
.cm-cursor { border-left-color: var(--accent); }
.cm-selectionBackground, .cm-focused .cm-selectionBackground { background: var(--surface-hover); }
.cm-active.cm-line { background: transparent; }
.HyperMD-header { font-weight: 700; }
.HyperMD-header-1 { font-size: 1.8em; line-height: 1.3; }
.HyperMD-header-2 { font-size: 1.5em; }
.HyperMD-header-3 { font-size: 1.3em; }
.HyperMD-header-4 { font-size: 1.15em; }
.HyperMD-header-5, .HyperMD-header-6 { font-size: 1em; }
.cm-header { color: var(--text); }
.cm-strong { font-weight: 700; color: var(--text); }
.cm-em { font-style: italic; }
.cm-strikethrough { text-decoration: line-through; color: var(--text-faint); }
.cm-inline-code { font-family: SFMono-Regular, Menlo, monospace; font-size: .9em; background: var(--surface); border-radius: 4px; padding: 1px 4px; color: var(--accent-dim); }
.cm-link, .cm-hmd-internal-link { color: var(--accent); }
.cm-underline { text-decoration: underline; text-decoration-color: var(--accent-dim); }
.cm-formatting { color: var(--text-faint); }
.HyperMD-codeblock { font-family: SFMono-Regular, Menlo, monospace; font-size: .9em; background: var(--bg-alt); }
.HyperMD-codeblock-begin { border-radius: 8px 8px 0 0; }
.HyperMD-codeblock-end { border-radius: 0 0 8px 8px; }
.HyperMD-quote { border-left: 3px solid var(--border); color: var(--text-dim); font-style: italic; }
.HyperMD-task-line.is-checked { color: var(--text-faint); }
.task-list-item-checkbox { margin: 0 7px 0 0; accent-color: var(--accent); vertical-align: middle; cursor: pointer; }
`

// Obsidian-style live-preview editor. Runs in a Shadow DOM so the vault's full
// theme.css can be injected (isolated), styling the editor like Obsidian.
export function LivePreviewEditor({
  doc,
  onChange,
  themeCss = '',
  scheme = 'dark',
  vars = {}
}: {
  doc: string
  onChange: (v: string) => void
  themeCss?: string
  scheme?: 'dark' | 'light'
  vars?: Record<string, string>
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const themeStyle = useRef<HTMLStyleElement | null>(null)
  const wrap = useRef<HTMLDivElement | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Build the shadow DOM + editor once.
  useEffect(() => {
    if (!hostRef.current) return
    const shadow = hostRef.current.attachShadow({ mode: 'open' })
    const base = document.createElement('style')
    base.textContent = BASE_CSS
    const tstyle = document.createElement('style')
    const w = document.createElement('div')
    w.className = `theme-${scheme} markdown-source-view mod-cm6 is-live-preview`
    w.style.height = '100%'
    const mount = document.createElement('div')
    mount.style.height = '100%'
    w.appendChild(mount)
    shadow.append(base, tstyle, w)
    themeStyle.current = tstyle
    wrap.current = w

    const v = new EditorView({
      parent: mount,
      root: shadow,
      state: EditorState.create({
        doc,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          drawSelection(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(defaultHighlightStyle),
          livePreview,
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

  // Apply / update the theme inside the shadow.
  useEffect(() => {
    if (themeStyle.current) themeStyle.current.textContent = themeCss
    if (wrap.current) {
      wrap.current.className = `theme-${scheme} markdown-source-view mod-cm6 is-live-preview`
      wrap.current.style.cssText = `height:100%;${Object.entries(vars).map(([k, val]) => `${k}:${val}`).join(';')}`
    }
  }, [themeCss, scheme, vars])

  useEffect(() => {
    const v = view.current
    if (!v || v.state.doc.toString() === doc) return
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: doc }, annotations: External.of(true) })
  }, [doc])

  return <div className="cm-host" ref={hostRef} style={{ height: '100%' }} />
}
