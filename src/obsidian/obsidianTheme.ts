// Pulls an Obsidian theme's CSS *variables* (palette/fonts) — not its full
// stylesheet — and applies them scoped to .obs-theme-scope, so the Notes editor
// adopts the theme's look without leaking styles into the rest of the app.

export function extractThemeVars(css: string, scheme: 'dark' | 'light'): Record<string, string> {
  const vars: Record<string, string> = {}
  let sheet: CSSStyleSheet
  try {
    sheet = new CSSStyleSheet()
    sheet.replaceSync(css.replace(/@import[^;]+;/g, '')) // @import is disallowed in constructable sheets
  } catch {
    return vars
  }
  const want =
    scheme === 'light' ? /\.theme-light|:root|(^|[\s,])body([\s.,:]|$)/ : /\.theme-dark|:root|(^|[\s,])body([\s.,:]|$)/
  const walk = (rules: CSSRuleList): void => {
    for (const r of Array.from(rules)) {
      const nested = (r as CSSGroupingRule).cssRules
      if (nested) walk(nested)
      const sel = (r as CSSStyleRule).selectorText
      if (sel && want.test(sel)) {
        const st = (r as CSSStyleRule).style
        for (let i = 0; i < st.length; i++) {
          const p = st.item(i)
          if (p.startsWith('--')) vars[p] = st.getPropertyValue(p).trim()
        }
      }
    }
  }
  walk(sheet.cssRules)
  return vars
}

export function applyThemeVars(vars: Record<string, string>): void {
  let el = document.getElementById('obs-theme-vars') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = 'obs-theme-vars'
    document.head.appendChild(el)
  }
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join('')
  el.textContent = body ? `.obs-theme-scope{${body}}` : ''
}

export function clearThemeVars(): void {
  const el = document.getElementById('obs-theme-vars')
  if (el) el.textContent = ''
}
