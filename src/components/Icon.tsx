// Minimal inline SVG icon set (lucide-style, stroke = currentColor).
const PATHS: Record<string, string> = {
  terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18"/>',
  bot:
    '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 4.5V8"/><circle cx="12" cy="3.5" r="1.2"/><circle cx="9" cy="13.5" r="1"/><circle cx="15" cy="13.5" r="1"/><path d="M2 13h2M20 13h2"/>',
  issue: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
  board: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  pr:
    '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5v7"/><path d="M18 15.5V12a3 3 0 0 0-3-3h-3"/><path d="m14 6-2 3 2 3"/>',
  check:
    '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 4.5h6V7H9z"/><path d="m9 13 2 2 4-4"/>',
  chart:
    '<line x1="4" y1="20" x2="20" y2="20"/><rect x="6" y="12" width="3" height="6"/><rect x="11" y="8" width="3" height="10"/><rect x="16" y="4" width="3" height="14"/>',
  notebook: '<path d="M6 4h11a1 1 0 0 1 1 1v15H7a1 1 0 0 1-1-1z"/><path d="M10 4v16"/>',
  settings:
    '<line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/><circle cx="9" cy="8" r="2"/><circle cx="15" cy="16" r="2"/>',
  diagram:
    '<rect x="4" y="4" width="7" height="4" rx="1"/><rect x="13" y="16" width="7" height="4" rx="1"/><path d="M7.5 8v5a2 2 0 0 0 2 2h7"/>',
  database:
    '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  branch:
    '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  graph:
    '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.3 7.2 10.5 16M16.7 7.2 13.5 16M7.5 6h9"/>',
  cols: '<rect x="3" y="4" width="7.5" height="16" rx="1"/><rect x="13.5" y="4" width="7.5" height="16" rx="1"/>',
  rows: '<rect x="4" y="3" width="16" height="7.5" rx="1"/><rect x="4" y="13.5" width="16" height="7.5" rx="1"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1"/>',
  mainGrid:
    '<rect x="3" y="3" width="10" height="18" rx="1"/><rect x="15" y="3" width="6" height="8" rx="1"/><rect x="15" y="13" width="6" height="8" rx="1"/>',
  help:
    '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2-2.5 3.4"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/>',
  diff: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7.5h3M8.5 6v3"/><path d="M14 16.5h3"/>',
  rocket:
    '<path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2"/><path d="M9 13.5a13 13 0 0 1 8-9.5c1.5 0 3 1.5 3 3a13 13 0 0 1-9.5 8z"/><circle cx="14.5" cy="9.5" r="1.5"/>',
  cog:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>',
  trash:
    '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  caret: '<polyline points="6 9 12 15 18 9"/>',
  expand:
    '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
  external:
    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  copy:
    '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>'
}

export function Icon({ name, size = 15 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? '' }}
    />
  )
}
