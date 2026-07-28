import { getAgent } from "../agents/registry.js";
import { runAgentCommand } from "../llm/provider.js";
import { createRun, saveArtifact, updateRunStatus, getArtifacts, getRun, type PipelineRun } from "../db/sqlite.js";
import { buildConsolidatedReport } from "./htmlReport.js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../../data/output");

// Ordem oficial do pipeline DABBA (Discovery → PRD → Architect → Backlog →
// Business Case), documentada no CLAUDE.md do framework original — cada
// fase usa o comando principal de geração do agente e recebe o artefato
// da fase anterior como premissa/contexto.
export const PIPELINE_STEPS = [
  { phase: "discovery", agentId: "discovery", command: "*start" },
  { phase: "prd", agentId: "prd", command: "*generate" },
  { phase: "architecture", agentId: "architect", command: "*design" },
  { phase: "backlog", agentId: "backlog", command: "*breakdown" },
  { phase: "business-case", agentId: "business-case", command: "*analyze" },
] as const;

// Cria o run e dispara o processamento em background (não bloqueia a
// resposta HTTP) — o cliente acompanha via polling em GET /pipeline/:id.
export function startPipeline(projectName: string, rfpText: string): PipelineRun {
  const run = createRun(projectName);
  processPipeline(run.id, rfpText).catch((err) => {
    console.error(`pipeline ${run.id} falhou:`, err);
  });
  return run;
}

async function processPipeline(runId: string, rfpText: string): Promise<void> {
  let carriedInput = rfpText;

  for (const step of PIPELINE_STEPS) {
    const agent = getAgent(step.agentId);
    if (!agent) {
      updateRunStatus(runId, "failed");
      throw new Error(`agente não encontrado no registry: ${step.agentId}`);
    }

    let result;
    try {
      result = await runAgentCommand({ systemPrompt: agent.persona, command: step.command, input: carriedInput });
    } catch (error) {
      updateRunStatus(runId, "failed");
      throw error;
    }

    saveArtifact(runId, step.phase, step.agentId, step.command, result.output, result.provider, result.model);
    carriedInput = result.output;
  }

  const run = getRun(runId);
  if (!run) throw new Error(`run não encontrado após processamento: ${runId}`);
  const artifacts = getArtifacts(runId);
  const html = buildConsolidatedReport(run, artifacts);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const reportPath = path.join(OUTPUT_DIR, `${runId}.html`);
  writeFileSync(reportPath, html, "utf-8");
  updateRunStatus(runId, "done", reportPath);
}
