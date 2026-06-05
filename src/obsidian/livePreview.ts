import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { EditorState, Range } from '@codemirror/state'

const HIDE = Decoration.replace({})

// Clickable task checkbox that toggles [ ] <-> [x] in the document.
class CheckWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number
  ) {
    super()
  }
  eq(o: CheckWidget): boolean {
    return o.checked === this.checked && o.from === this.from
  }
  toDOM(view: EditorView): HTMLElement {
    const i = document.createElement('input')
    i.type = 'checkbox'
    i.checked = this.checked
    i.className = 'task-list-item-checkbox'
    i.setAttribute('data-task', this.checked ? 'x' : ' ')
    i.addEventListener('mousedown', (e) => e.preventDefault())
    i.addEventListener('click', () => {
      view.dispatch({ changes: { from: this.from + 1, to: this.from + 2, insert: this.checked ? ' ' : 'x' } })
    })
    return i
  }
  ignoreEvent(): boolean {
    return false
  }
}

function activeLineSet(state: EditorState): Set<number> {
  const s = new Set<number>()
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number
    const b = state.doc.lineAt(r.to).number
    for (let l = a; l <= b; l++) s.add(l)
  }
  return s
}

function build(view: EditorView): DecorationSet {
  const decos: Range<Decoration>[] = []
  const state = view.state
  const active = activeLineSet(state)
  const isActive = (pos: number): boolean => active.has(state.doc.lineAt(pos).number)
  const line = (cls: string, pos: number): void => {
    decos.push(Decoration.line({ class: cls }).range(state.doc.lineAt(pos).from))
  }
  const mark = (cls: string, from: number, to: number): void => {
    if (to > from) decos.push(Decoration.mark({ class: cls }).range(from, to))
  }
  // Hide a formatting mark off the active line; otherwise style it dimmed.
  const fmt = (cls: string, from: number, to: number, extraSpace = false): void => {
    let end = to
    if (extraSpace && state.doc.sliceString(to, to + 1) === ' ') end = to + 1
    if (isActive(from)) mark(`cm-formatting ${cls}`, from, to)
    else if (end > from) decos.push(HIDE.range(from, end))
  }

  for (const l of active) line('cm-active cm-activeLine', state.doc.line(l).from)

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const n = node.name

        const h = /^ATXHeading([1-6])$/.exec(n)
        if (h) {
          line(`HyperMD-header HyperMD-header-${h[1]}`, node.from)
          mark(`cm-header cm-header-${h[1]}`, node.from, node.to)
          return
        }
        if (n === 'FencedCode' || n === 'CodeBlock') {
          const a = state.doc.lineAt(node.from).number
          const b = state.doc.lineAt(node.to).number
          for (let ln = a; ln <= b; ln++) {
            let c = 'HyperMD-codeblock cm-line'
            if (ln === a) c += ' HyperMD-codeblock-begin'
            if (ln === b) c += ' HyperMD-codeblock-end'
            line(c, state.doc.line(ln).from)
          }
          return
        }
        if (n === 'Blockquote') {
          line('HyperMD-quote HyperMD-quote-1', node.from)
          return
        }
        if (n === 'ListItem') {
          line('HyperMD-list-line HyperMD-list-line-1', node.from)
          return
        }
        if (n === 'TaskMarker') {
          const checked = /[xX]/.test(state.doc.sliceString(node.from + 1, node.from + 2))
          line(`HyperMD-task-line${checked ? ' is-checked' : ''}`, node.from)
          if (node.from - 2 >= 0 && /[-*+] /.test(state.doc.sliceString(node.from - 2, node.from)))
            decos.push(HIDE.range(node.from - 2, node.from))
          decos.push(Decoration.replace({ widget: new CheckWidget(checked, node.from) }).range(node.from, node.to))
          return
        }

        if (n === 'StrongEmphasis') mark('cm-strong', node.from, node.to)
        else if (n === 'Emphasis') mark('cm-em', node.from, node.to)
        else if (n === 'InlineCode') mark('cm-inline-code', node.from, node.to)
        else if (n === 'Strikethrough') mark('cm-strikethrough', node.from, node.to)
        else if (n === 'Link') mark('cm-link cm-underline', node.from, node.to)
        else if (n === 'URL' && !isActive(node.from)) decos.push(HIDE.range(node.from, node.to))
        else if (n === 'HeaderMark') fmt('cm-formatting-header', node.from, node.to, true)
        else if (n === 'EmphasisMark') fmt('cm-formatting-em', node.from, node.to)
        else if (n === 'CodeMark') fmt('cm-formatting-code', node.from, node.to)
        else if (n === 'StrikethroughMark') fmt('cm-formatting-strikethrough', node.from, node.to)
        else if (n === 'LinkMark') fmt('cm-formatting-link', node.from, node.to)
        else if (n === 'QuoteMark') fmt('cm-formatting-quote', node.from, node.to)
      }
    })

    // Wikilinks [[name]] / [[name|alias]]
    const text = state.doc.sliceString(from, to)
    const re = /\[\[([^\]\n]+?)\]\]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      const start = from + m.index
      const end = start + m[0].length
      mark('cm-hmd-internal-link cm-underline', start, end)
      if (!isActive(start)) {
        decos.push(HIDE.range(start, start + 2))
        const pipe = m[1].indexOf('|')
        if (pipe >= 0) decos.push(HIDE.range(start + 2, start + 2 + pipe + 1))
        decos.push(HIDE.range(end - 2, end))
      }
    }
  }

  return Decoration.set(decos, true)
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = build(u.view)
    }
  },
  { decorations: (v) => v.decorations }
)
