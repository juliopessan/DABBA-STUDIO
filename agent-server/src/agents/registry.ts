import { loadAgents, type Agent } from "./loader.js";

const agents = new Map<string, Agent>(loadAgents().map((a) => [a.id, a]));

export function listAgents(): Agent[] {
  return [...agents.values()];
}

export function getAgent(id: string): Agent | undefined {
  return agents.get(id);
}
