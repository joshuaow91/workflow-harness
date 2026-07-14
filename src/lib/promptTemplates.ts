import { useSyncExternalStore } from 'react'

// Reusable prompt snippets the user can inject into a session's input. Persisted in
// localStorage (renderer-only); seeded once with a starter template.
export interface PromptTemplate {
  id: string
  name: string
  body: string
}

const KEY = 'harness:promptTemplates'

const MULTI_AGENT = `Use a multi-agent workflow for this task. Structure it as follows:

1. GROUND TRUTH FIRST. Before any opinions, spawn recon agents to establish facts:
   the actual code/data model, the current behavior of existing systems, and REAL
   production data samples (use the read-only analytics Mongo connection; anonymize
   customers). Write the findings into a shared brief file that every later agent
   must read. No agent may contradict the brief without new evidence.

2. PERSONA PANEL. Spawn agents as personas with CONFLICTING incentives, not just
   skills — e.g. UI engineer, UX engineer, product designer, data scientist,
   BI analyst, domain expert, customer success, customer support, sales rep, and
   always one SKEPTICAL END-USER proxy (e.g. a dealership GM who reads reports in
   90 seconds and distrusts vendor math). Each takes independent, opinionated
   positions BEFORE seeing the others' (structured output, concrete, no hedging).

3. DUELS FOR CONTESTED CALLS. For each genuinely contested decision, run a
   champion round: one agent argues each option's strongest case (with honest
   weaknesses + verbatim user-facing copy), then judges with distinct business
   lenses score them and pick a winner or a precise hybrid.

4. RATIFY UNTIL CONSENT. A synthesizer merges everything into ONE decisive spec.
   The full panel then votes: approve only if they'd ship it; objections must be
   concrete and blocking. Revise and re-vote until unanimous or ~5 rounds, then
   record unresolved dissents explicitly as decisions for ME to make.

5. EVIDENCE BEATS OPINION. If a claim can be measured (from prod data, the
   codebase, or web research on industry norms), measure it mid-debate and inject
   it into the shared brief so later rounds must address it. Push back on my own
   assumptions when the evidence disagrees.

6. DELIVERABLES: the ratified spec; each persona's final justification in their
   own voice; the dissent list; and a working mock/prototype built on the real
   data (not lorem ipsum), published as an artifact.`

const SEED: PromptTemplate[] = [
  { id: 'multi-agent-workflow', name: 'Multi-agent workflow', body: MULTI_AGENT }
]

function load(): PromptTemplate[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PromptTemplate[]
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    /* fall through to seed */
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(SEED))
  } catch {
    /* ignore */
  }
  return SEED
}

let templates = load()
const subs = new Set<() => void>()

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(templates))
  } catch {
    /* ignore */
  }
  for (const s of subs) s()
}

export const promptTemplates = {
  all: (): PromptTemplate[] => templates,
  add: (name: string, body: string): PromptTemplate => {
    const t: PromptTemplate = {
      id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      body
    }
    templates = [...templates, t]
    persist()
    return t
  },
  update: (id: string, name: string, body: string): void => {
    templates = templates.map((t) => (t.id === id ? { ...t, name, body } : t))
    persist()
  },
  remove: (id: string): void => {
    templates = templates.filter((t) => t.id !== id)
    persist()
  },
  subscribe: (cb: () => void): (() => void) => {
    subs.add(cb)
    return () => subs.delete(cb)
  }
}

export function usePromptTemplates(): PromptTemplate[] {
  return useSyncExternalStore(promptTemplates.subscribe, promptTemplates.all)
}
