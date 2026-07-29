import { loadAgents, type Agent } from "./loader.js";

let agents = new Map<string, Agent>();

// Chamado uma vez, no boot do servidor, antes de app.listen — loadAgents()
// is async because in SEA mode (packaged sidecar) it reads the personas from
// embedded assets via a dynamic `import("node:sea")`. Once initialised,
// listAgents()/getAgent() stay synchronous (the map is already built).
export async function initAgents(): Promise<void> {
  agents = new Map((await loadAgents()).map((a) => [a.id, a]));
}

export function listAgents(): Agent[] {
  return [...agents.values()];
}

export function getAgent(id: string): Agent | undefined {
  return agents.get(id);
}
