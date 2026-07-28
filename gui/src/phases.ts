// Canonical pipeline order. The agent-server returns agents alphabetically,
// which has nothing to do with the order the work actually happens in —
// every surface that lists agents or phases sorts through here instead, so
// the UI always reads Discovery → PRD → Architecture → Backlog → Business Case.
export interface Phase {
  id: string;
  label: string;
  agent: string;
}

export const PHASES: Phase[] = [
  { id: "discovery", label: "Discovery", agent: "discovery" },
  { id: "prd", label: "PRD", agent: "prd" },
  { id: "architecture", label: "Architecture", agent: "architect" },
  { id: "backlog", label: "Backlog", agent: "backlog" },
  { id: "business-case", label: "Business Case", agent: "business-case" },
];

const AGENT_ORDER = PHASES.map((p) => p.agent);

/** Sorts agents into pipeline order; anything unknown goes to the end. */
export function byPipelineOrder<T extends { id: string }>(agents: T[]): T[] {
  return [...agents].sort((a, b) => {
    const ia = AGENT_ORDER.indexOf(a.id);
    const ib = AGENT_ORDER.indexOf(b.id);
    return (ia === -1 ? Number.MAX_SAFE_INTEGER : ia) - (ib === -1 ? Number.MAX_SAFE_INTEGER : ib);
  });
}
