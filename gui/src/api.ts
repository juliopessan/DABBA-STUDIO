const API_BASE = import.meta.env.VITE_AGENT_SERVER_URL ?? "http://localhost:8765";

export interface AgentSummary {
  id: string;
  name: string;
  commands: string[];
}

export interface RunResult {
  mode: "live" | "dry-run";
  model?: string;
  output: string;
}

export async function fetchAgents(): Promise<AgentSummary[]> {
  const res = await fetch(`${API_BASE}/agents`);
  if (!res.ok) throw new Error(`GET /agents failed: ${res.status}`);
  return res.json();
}

export async function runCommand(
  agentId: string,
  command: string,
  input: string
): Promise<RunResult> {
  const res = await fetch(`${API_BASE}/agents/${agentId}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command, input }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `POST /agents/${agentId}/run failed: ${res.status}`);
  return data;
}
