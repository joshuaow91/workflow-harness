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
    i.className = 'cm-task-check'
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

const MARKS = new Set([
  'HeaderMark',
  'EmphasisMark',
  'CodeMark',
  'StrikethroughMark',
  'LinkMark',
  'QuoteMark',
  'URL'
])

function build(view: EditorView): DecorationSet {
  const decos: Range<Decoration>[] = []
  const state = view.state
  const active = activeLineSet(state)
  const isActive = (pos: number): boolean => active.has(state.doc.lineAt(pos).number)

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const n = node.name
        const h = /^ATXHeading([1-6])$/.exec(n)
        if (h) {
          decos.push(Decoration.line({ class: `cm-h cm-h${h[1]}` }).range(state.doc.lineAt(node.from).from))
          return
        }
        if (n === 'TaskMarker') {
          const checked = /[xX]/.test(state.doc.sliceString(node.from + 1, node.from + 2))
          if (node.from - 2 >= 0 && /[-*+] /.test(state.doc.sliceString(node.from - 2, node.from)))
            decos.push(HIDE.range(node.from - 2, node.from))
          decos.push(Decoration.replace({ widget: new CheckWidget(checked, node.from) }).range(node.from, node.to))
          return
        }
        if (n === 'StrongEmphasis') decos.push(Decoration.mark({ class: 'cm-strong' }).range(node.from, node.to))
        else if (n === 'Emphasis') decos.push(Decoration.mark({ class: 'cm-em' }).range(node.from, node.to))
        else if (n === 'InlineCode') decos.push(Decoration.mark({ class: 'cm-inline-code' }).range(node.from, node.to))
        else if (n === 'Strikethrough') decos.push(Decoration.mark({ class: 'cm-strike' }).range(node.from, node.to))
        else if (n === 'Link' || n === 'Image') decos.push(Decoration.mark({ class: 'cm-link' }).range(node.from, node.to))
        else if (n === 'Blockquote') decos.push(Decoration.line({ class: 'cm-quote' }).range(state.doc.lineAt(node.from).from))

        if (MARKS.has(n) && !isActive(node.from)) {
          let end = node.to
          if (n === 'HeaderMark' && state.doc.sliceString(node.to, node.to + 1) === ' ') end = node.to + 1
          if (end > node.from) decos.push(HIDE.range(node.from, end))
        }
      }
    })

    // Wikilinks [[name]] / [[name|alias]] — not in standard markdown grammar.
    const text = state.doc.sliceString(from, to)
    const re = /\[\[([^\]\n]+?)\]\]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      const start = from + m.index
      const end = start + m[0].length
      decos.push(Decoration.mark({ class: 'cm-wikilink' }).range(start, end))
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
