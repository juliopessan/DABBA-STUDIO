import { getAgent } from "../agents/registry.js";
import { runAgentCommand } from "../llm/provider.js";
import { createRun, saveArtifact, updateRunStatus, getArtifacts, getRun, type PipelineRun } from "../db/sqlite.js";
import { buildConsolidatedReport } from "./htmlReport.js";
import { unwrapOuterCodeFence } from "./markdown.js";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { OUTPUT_DIR } from "../appPaths.js";

// Official DABBA pipeline order (Discovery → PRD → Architect → Backlog →
// Business Case), documented in the original framework's CLAUDE.md — each
// phase runs the agent's generating command(s) and receives the previous
// phase's artifact as its premise/context.
//
// Backlog chains 3 commands (not 1): free models tend to drop sections when a
// single prompt asks for Epics + Effort Estimation + Staffing at once (tested:
// nvidia/nemotron-nano-9b ignored the last two even with an explicit
// instruction). Asking for each section as a separate, chained command is far
// more reliable than one mega-prompt.
export const PIPELINE_STEPS = [
  { phase: "discovery", agentId: "discovery", commands: ["*start"] },
  { phase: "prd", agentId: "prd", commands: ["*generate"] },
  { phase: "architecture", agentId: "architect", commands: ["*design"] },
  { phase: "backlog", agentId: "backlog", commands: ["*breakdown", "*estimate", "*staffing"] },
  { phase: "business-case", agentId: "business-case", commands: ["*analyze"] },
] as const;

// Creates the run and kicks off processing in the background (it does not
// block the HTTP response) — the client follows along by polling
// GET /pipeline/:id.
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
      throw new Error(`agent not found in registry: ${step.agentId}`);
    }

    // Within a phase, each command receives ALL accumulated outputs from the
    // earlier commands of that same phase (not just the immediately previous
    // one) — *staffing needs to see *breakdown (story volume per speciality)
    // and *estimate (points/sprints) together, not the *estimate summary
    // alone.
    let phaseInput = carriedInput;
    const sections: string[] = [];
    let lastProvider: string | undefined;
    let lastModel: string | undefined;

    for (const command of step.commands) {
      let result;
      try {
        result = await runAgentCommand({ systemPrompt: agent.persona, command, input: phaseInput, autoMode: true });
      } catch (error) {
        updateRunStatus(runId, "failed");
        throw error;
      }
      // Unwrap the outer fence (if any) BEFORE concatenating — each command
      // produces its own response with its own individual fence; if we
      // concatenated first, the combined text would hold multiple fence pairs
      // and the unwrap heuristic (which only fires on exactly 1 pair) would
      // stop triggering for any of them.
      sections.push(unwrapOuterCodeFence(result.output));
      phaseInput = sections.join("\n\n");
      lastProvider = result.provider;
      lastModel = result.model;
    }

    const combinedOutput = sections.join("\n\n");
    saveArtifact(runId, step.phase, step.agentId, step.commands.join(" → "), combinedOutput, lastProvider, lastModel);
    carriedInput = combinedOutput;
  }

  const run = getRun(runId);
  if (!run) throw new Error(`run not found after processing: ${runId}`);
  const artifacts = getArtifacts(runId);
  const html = buildConsolidatedReport(run, artifacts);

  const reportPath = path.join(OUTPUT_DIR, `${runId}.html`);
  writeFileSync(reportPath, html, "utf-8");
  updateRunStatus(runId, "done", reportPath);
}
