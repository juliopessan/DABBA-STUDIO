import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DATA_DIR } from "../appPaths.js";

const db = new DatabaseSync(path.join(DATA_DIR, "dabba.sqlite"));

db.exec(`
  CREATE TABLE IF NOT EXISTS pipeline_runs (
    id TEXT PRIMARY KEY,
    project_name TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    report_path TEXT
  );

  CREATE TABLE IF NOT EXISTS phase_artifacts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    command TEXT NOT NULL,
    output TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES pipeline_runs(id)
  );
`);

export interface PipelineRun {
  id: string;
  project_name: string;
  status: "running" | "done" | "failed";
  created_at: string;
  report_path: string | null;
}

export interface PhaseArtifact {
  id: string;
  run_id: string;
  phase: string;
  agent_id: string;
  command: string;
  output: string;
  provider: string | null;
  model: string | null;
  created_at: string;
}

export function createRun(projectName: string): PipelineRun {
  const run: PipelineRun = {
    id: randomUUID(),
    project_name: projectName,
    status: "running",
    created_at: new Date().toISOString(),
    report_path: null,
  };
  db.prepare(
    "INSERT INTO pipeline_runs (id, project_name, status, created_at, report_path) VALUES (?, ?, ?, ?, ?)"
  ).run(run.id, run.project_name, run.status, run.created_at, run.report_path);
  return run;
}

export function saveArtifact(
  runId: string,
  phase: string,
  agentId: string,
  command: string,
  output: string,
  provider?: string,
  model?: string
): PhaseArtifact {
  const artifact: PhaseArtifact = {
    id: randomUUID(),
    run_id: runId,
    phase,
    agent_id: agentId,
    command,
    output,
    provider: provider ?? null,
    model: model ?? null,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO phase_artifacts (id, run_id, phase, agent_id, command, output, provider, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    artifact.id,
    artifact.run_id,
    artifact.phase,
    artifact.agent_id,
    artifact.command,
    artifact.output,
    artifact.provider,
    artifact.model,
    artifact.created_at
  );
  return artifact;
}

export function updateRunStatus(runId: string, status: PipelineRun["status"], reportPath?: string) {
  db.prepare("UPDATE pipeline_runs SET status = ?, report_path = COALESCE(?, report_path) WHERE id = ?").run(
    status,
    reportPath ?? null,
    runId
  );
}

export function getRun(runId: string): PipelineRun | undefined {
  return db.prepare("SELECT * FROM pipeline_runs WHERE id = ?").get(runId) as PipelineRun | undefined;
}

export function getArtifacts(runId: string): PhaseArtifact[] {
  return db
    .prepare("SELECT * FROM phase_artifacts WHERE run_id = ? ORDER BY created_at ASC")
    .all(runId) as PhaseArtifact[];
}
