import { basename } from 'path'

// Claude Code encodes a project's absolute path into a directory name by
// replacing path separators (and `.` / `_`) with `-`. That encoding is LOSSY,
// so we never trust a slug to recover the real path — we resolve paths from the
// `cwd` field inside the session JSONL instead. These helpers are fallback-only,
// used when a project has no parseable sessions.

export function slugToPathFallback(slug: string): string {
  // Best-effort: leading marker + separators back to `/`. Cannot recover `_`.
  const withRoot = slug.startsWith('-') ? slug.slice(1) : slug
  return '/' + withRoot.replace(/-/g, '/')
}

export function displayNameFromPath(path: string): string {
  return basename(path) || path
}
