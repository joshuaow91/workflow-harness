# workflow-harness

A macOS cockpit for a multi-repo Claude Code workflow. One window with:

- **Sidebar** — Claude **projects → sessions** (read live from `~/.claude`, with busy/idle badges) and **repos → git worktrees** (create / remove / open).
- **Terminals** — split, resizable panes each running the real `claude` CLI. Click a session to `claude --resume` it; click a repo/worktree to start a fresh session in that directory.
- **Browser** — an embedded web browser pane.
- **GitHub tabs** — **Issues**, **My PRs**, **Review** (PRs awaiting your review, org-wide), and **Board** (Projects v2 kanban). All via the `gh` CLI.

## Architecture

Electron (main + preload + renderer) scaffolded with `electron-vite`.

- **Main** (`electron/main`) — reads `~/.claude` (`claude/ClaudeStore`), runs git/`gh` (`git/`, `github/`), and owns terminals (`terminal/`). The `TerminalBackend` interface is a seam: v1 uses `XtermPtyBackend` (node-pty + xterm.js); a future libghostty surface can drop in without touching callers.
- **Preload** (`electron/preload`) — exposes a typed, sandboxed `window.api`.
- **Renderer** (`src`) — React UI. Terminals and the browser stay mounted across tab switches so state survives.
- **Shared** (`shared`) — IPC channel registry and cross-process types.

## Develop

```bash
npm install          # also rebuilds node-pty against Electron (postinstall)
npm run dev          # launch the app with HMR
npm run typecheck    # tsc for main + renderer
npm run build        # production build of all three targets
```

Requires the `claude` and `gh` CLIs on `PATH`.

### Board tab — one-time scope

GitHub Projects needs the `read:project` scope, which a default `gh` login lacks. Grant it once:

```bash
gh auth refresh -s read:project
```

The Board tab detects the missing scope and shows this command until it's granted.

## Roadmap

- libghostty-backed terminal surface (behind `TerminalBackend`) once its embedding API stabilizes.
- Agent-SDK / headless session driving and a rendered chat/diff view.
- Inline PR review with comment submission.
- An MCP server exposing app context (selected repo / open PR) to Claude sessions.
