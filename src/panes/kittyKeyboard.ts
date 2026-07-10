// Minimal kitty keyboard protocol support for xterm 5.x, which lacks it natively.
//
// Modern TUIs (claude, codex, neovim…) turn the protocol on at startup by pushing
// flags — CSI > flags u — and then expect key events encoded as CSI-u. Without a
// terminal that speaks it, modified keys like Shift+Enter are indistinguishable
// from their legacy bytes (both are just \r), so the app can't offer "Shift+Enter =
// newline". Ghostty speaks it, which is why it works there and a raw xterm doesn't.
//
// This tracks the pushed-flags stack, answers the flags query (CSI ? u — how an app
// detects support), and encodes keydowns as CSI-u while the protocol is active.
// Docs: https://sw.kovidgoyal.net/kitty/keyboard-protocol/

// Matches any CSI ... u sequence in a chunk of terminal OUTPUT. The private-prefix
// forms (>, <, =, ?) are the protocol control messages; an unprefixed CSI u is the
// legacy "restore cursor" and is ignored.
const CSI_U = /\x1b\[([<>=?])?([0-9;]*)u/g

// kitty functional-key numbers. Only the keys we actively encode need to be here;
// extend as more keys need disambiguation. Enter=13 is what makes Shift+Enter work.
const KEY_CODES: Record<string, number> = {
  Enter: 13
}

export class KittyKeyboard {
  // Stack of pushed flag sets; the top entry is the currently-active flags.
  private stack: number[] = []

  get flags(): number {
    return this.stack.length ? this.stack[this.stack.length - 1] : 0
  }
  get active(): boolean {
    return this.stack.length > 0
  }

  /**
   * Scan a chunk of terminal output for kitty control sequences and update state.
   * Returns a string to write back to the pty (the flags report, in answer to a
   * query) or null. The sequences are left in the output stream — xterm ignores
   * unknown CSI ... u sequences, so there's nothing to strip.
   */
  scanOutput(data: string): string | null {
    if (data.indexOf('\x1b[') === -1) return null
    let reply: string | null = null
    CSI_U.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = CSI_U.exec(data)) !== null) {
      const prefix = m[1] ?? ''
      const params = m[2] ? m[2].split(';').map((n) => (n === '' ? 0 : parseInt(n, 10))) : []
      if (prefix === '>') this.stack.push(params[0] ?? 0) // push flags
      else if (prefix === '<') {
        const n = params[0] || 1 // pop n entries
        for (let i = 0; i < n; i++) this.stack.pop()
      } else if (prefix === '=') this.set(params[0] ?? 0, params[1] ?? 1) // set current
      else if (prefix === '?') reply = `\x1b[?${this.flags}u` // query -> report flags
    }
    return reply
  }

  private set(flags: number, mode: number): void {
    const cur = this.flags
    let next = flags
    if (mode === 2) next = cur | flags // set specified bits
    else if (mode === 3) next = cur & ~flags // reset specified bits
    if (this.stack.length) this.stack[this.stack.length - 1] = next
    else this.stack.push(next)
  }

  /**
   * Encode a keydown as a kitty CSI-u sequence, or null to let xterm emit its
   * legacy bytes. Conservative: only keys whose legacy encoding is ambiguous under
   * modifiers are encoded (currently Enter, so Shift+Enter is distinguishable from
   * Enter). Unmodified keys and keys not in KEY_CODES stay legacy — so normal
   * typing, Ctrl+C, arrows, Shift+Tab, etc. are untouched.
   */
  encode(e: KeyboardEvent): string | null {
    if (!this.active) return null
    const mod =
      1 + (e.shiftKey ? 1 : 0) + (e.altKey ? 2 : 0) + (e.ctrlKey ? 4 : 0) + (e.metaKey ? 8 : 0)
    if (mod === 1) return null // no modifiers: keep legacy
    const code = KEY_CODES[e.key]
    if (code == null) return null
    return `\x1b[${code};${mod}u`
  }

  reset(): void {
    this.stack = []
  }
}
