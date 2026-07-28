import { loadAgents, type Agent } from "./loader.js";

let agents = new Map<string, Agent>();

// Chamado uma vez, no boot do servidor, antes de app.listen — loadAgents()
// é async porque no modo SEA (sidecar empacotado) lê as personas de assets
// embutidos via `import("node:sea")` dinâmico. Depois de inicializado,
// listAgents()/getAgent() seguem síncronos (o mapa já está pronto).
export async function initAgents(): Promise<void> {
  agents = new Map((await loadAgents()).map((a) => [a.id, a]));
}

export function listAgents(): Agent[] {
  return [...agents.values()];
}

export function getAgent(id: string): Agent | undefined {
  return agents.get(id);
}
