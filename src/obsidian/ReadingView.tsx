import { useEffect, useRef } from 'react'

// Renders the note's HTML inside a Shadow DOM with the vault's full theme.css
// injected — fully isolated, so the theme styles headers, code blocks, task
// lists, callouts etc. exactly like Obsidian's reading view, without leaking.
export function ReadingView({
  html,
  themeCss,
  scheme,
  vars,
  onToggleTask
}: {
  html: string
  themeCss: string
  scheme: 'dark' | 'light'
  vars: Record<string, string>
  onToggleTask: (index: number) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<ShadowRoot | null>(null)

  useEffect(() => {
    if (hostRef.current && !shadowRef.current)
      shadowRef.current = hostRef.current.attachShadow({ mode: 'open' })
  }, [])

  useEffect(() => {
    const sh = shadowRef.current
    if (!sh) return
    // Help body/:root-scoped theme rules apply inside the shadow.
    const css = (themeCss || '')
      .replace(/body\.theme-(dark|light)/g, '.theme-$1')
      .replace(/(^|[\s,{])body([\s,{:.])/g, '$1.obs-body$2')
    const varStyle = Object.entries(vars || {})
      .map(([k, v]) => `${k}:${v}`)
      .join(';')

    sh.innerHTML = `
      <style>
        :host { display:block; height:100%; overflow:auto; }
        .obs-body { display:block; min-height:100%; background: var(--background-primary, #1e1e1e); color: var(--text-normal, #ddd); }
        .markdown-preview-sizer { padding: 28px 36px; max-width: 900px; margin: 0 auto; }
        pre { position: relative; }
        .copy-code-button { position:absolute; top:6px; right:6px; font-size:11px; padding:2px 7px; border-radius:5px; cursor:pointer; border:1px solid var(--background-modifier-border, #444); background: var(--background-secondary, #2a2a2a); color: var(--text-muted, #aaa); opacity:0; transition:opacity .12s; }
        pre:hover .copy-code-button { opacity:1; }
        .task-list-item-checkbox { cursor:pointer; }
        a { cursor:pointer; }
      </style>
      <style>${css}</style>
      <div class="theme-${scheme} obs-body mod-windows" style="${varStyle}">
        <div class="app-container"><div class="workspace"><div class="workspace-split"><div class="workspace-leaf">
          <div class="workspace-leaf-content"><div class="view-content">
            <div class="markdown-reading-view">
              <div class="markdown-preview-view markdown-rendered node-insert-event allow-fold-headings show-indentation-guide allow-fold-lists is-readable-line-width">
                <div class="markdown-preview-sizer markdown-preview-section">${html}</div>
              </div>
            </div>
          </div></div>
        </div></div></div></div>
      </div>`

    sh.querySelectorAll('pre').forEach((pre) => {
      const btn = document.createElement('button')
      btn.className = 'copy-code-button'
      btn.textContent = 'Copy'
      btn.addEventListener('click', () => {
        const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
        void navigator.clipboard.writeText(code)
        btn.textContent = 'Copied'
        setTimeout(() => (btn.textContent = 'Copy'), 1200)
      })
      pre.appendChild(btn)
    })

    let ti = 0
    sh.querySelectorAll('input[type=checkbox]').forEach((cb) => {
      const idx = ti++
      cb.removeAttribute('disabled')
      cb.classList.add('task-list-item-checkbox')
      cb.closest('li')?.classList.add('task-list-item')
      cb.closest('ul')?.classList.add('contains-task-list')
      cb.addEventListener('change', () => onToggleTask(idx))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, themeCss, scheme])

  return <div className="obs-reading-host" ref={hostRef} />
}
