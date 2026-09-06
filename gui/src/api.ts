const API_BASE = import.meta.env.VITE_AGENT_SERVER_URL ?? "http://localhost:8765";

export interface AgentSummary {
  id: string;
  name: string;
  commands: string[];
}

export interface RunResult {
  mode: "live" | "dry-run";
  provider?: "anthropic" | "openrouter";
  model?: string;
  output: string;
  fallbackAttempts?: { model: string; status: number }[];
}

export async function fetchAgents(): Promise<AgentSummary[]> {
  const res = await fetch(`${API_BASE}/agents`);
  if (!res.ok) throw new Error(`GET /agents failed: ${res.status}`);
  return res.json();
}

export interface ExtractedFile {
  filename: string;
  text: string;
}

export async function extractTextFromFile(file: File): Promise<ExtractedFile> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/extract-text`, { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `POST /extract-text failed: ${res.status}`);
  return data;
}

export interface PipelineStep {
  phase: string;
  agentId: string;
  commands: string[];
}

export interface PipelineArtifact {
  id: string;
  run_id: string;
  phase: string;
  agent_id: string;
  command: string;
  provider: string | null;
  model: string | null;
  created_at: string;
  outputPreview: string;
}

export interface PipelineRun {
  id: string;
  project_name: string;
  status: "running" | "done" | "failed";
  created_at: string;
  report_path: string | null;
}

export interface PipelineStatus {
  run: PipelineRun;
  artifacts: PipelineArtifact[];
  reportUrl: string | null;
  proposalReportUrl: string | null;
}

export async function startPipeline(projectName: string, rfpText: string): Promise<{ runId: string; steps: PipelineStep[] }> {
  const res = await fetch(`${API_BASE}/pipeline/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectName, rfpText }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `POST /pipeline/run failed: ${res.status}`);
  return data;
}

export async function getPipelineStatus(runId: string): Promise<PipelineStatus> {
  const res = await fetch(`${API_BASE}/pipeline/${runId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `GET /pipeline/${runId} failed: ${res.status}`);
  return data;
}

export function pipelineReportUrl(runId: string): string {
  return `${API_BASE}/pipeline/${runId}/report.html`;
}

export function pipelineProposalReportUrl(runId: string): string {
  return `${API_BASE}/pipeline/${runId}/proposal.html`;
}

export type Location = "onshore" | "nearshore" | "offshore";

export interface Costing {
  total: number;
  currency: string;
  benchmarkOnly: boolean;
}

export interface ProposalResult {
  costing: Costing;
  reportUrl: string;
}

// Nick reads the finished analysis and prices it against the stored staffing
// plan and rate card — never a raw single-command call, which is what left
// the generic agent grid producing narrative with no team or cost tables.
export async function generateProposal(runId: string, location: Location): Promise<ProposalResult> {
  const res = await fetch(`${API_BASE}/pipeline/${runId}/proposal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ location }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `POST /pipeline/${runId}/proposal failed: ${res.status}`);
  return { costing: data.costing, reportUrl: `${API_BASE}${data.reportUrl}` };
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
