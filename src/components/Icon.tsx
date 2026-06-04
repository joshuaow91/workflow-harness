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
    '<rect x="3" y="3" width="10" height="18" rx="1"/><rect x="15" y="3" width="6" height="8" rx="1"/><rect x="15" y="13" width="6" height="8" rx="1"/>'
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
