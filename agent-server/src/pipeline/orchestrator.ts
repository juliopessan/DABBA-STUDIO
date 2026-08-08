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
// Every multi-command phase below follows the same rule, discovered with
// Backlog: free models reliably drop sections when a single prompt asks for
// several distinct deliverables at once (tested: nvidia/nemotron-nano-9b
// ignored the last two of three sections even with an explicit instruction
// to include them). Splitting into separate, chained commands — each asking
// for ONE non-overlapping deliverable — is far more reliable than one
// mega-prompt. Commands were only added to a chain when their scope is
// disjoint from what an earlier command in the same phase already produces;
// e.g. Architecture's `*design` alone was measured (across 3 real pipeline
// runs) to produce 4-8 of the 11 Mermaid diagrams the framework requires —
// splitting it into its 5 TOGAF sub-phases fixes the same drop-under-load
// pattern Backlog had. Business Case's `*analyze` was NOT split: every run
// measured already produced its full 10-section structure from one command,
// so chaining more commands there would only add cost without fixing a real
// gap — and its remaining commands (*roi, *costs, *risks, *alternatives,
// *recommendation) each cover a section `*analyze` already includes,
// so they'd risk duplicating content instead of adding it.
export const PIPELINE_STEPS = [
  // *start alone produces an interview SCRIPT (questions with no answers) —
  // there is no human to interview in an automated pipeline, so it left
  // discovery-report.md with zero captured requirements in every run
  // measured. *generate is the command whose own workflow (context →
  // stakeholders → problems → constraints → assumptions/risks → report)
  // self-answers those questions under AUTO_MODE_PREFIX and produces the
  // actual report — *start is not called at all here.
  { phase: "discovery", agentId: "discovery", commands: ["*generate"] },
  // *trace cross-checks FR/NFR traceability against the discovery report —
  // measured to matter: one real run had the backlog phase cite 9 FR IDs
  // (FR-004..FR-012) that *generate's PRD never defined. *personas is
  // skipped: `*generate`'s own PRD structure already includes a Personas
  // section, so re-running it would duplicate rather than add.
  { phase: "prd", agentId: "prd", commands: ["*generate", "*trace"] },
  // Non-overlapping TOGAF phase split (see rationale above) instead of the
  // single `*design` mega-command, plus `*review` (NFR-coverage check) as a
  // final, disjoint QA pass.
  {
    phase: "architecture",
    agentId: "architect",
    commands: ["*phase-a", "*phase-b", "*phase-c", "*phase-d", "*phase-e", "*review"],
  },
  // *sprint (MVP scoping) and *trace (Stories → FR/NFR check) are genuinely
  // new sections *breakdown/*estimate/*staffing don't produce. *prioritize
  // and *dependencies are skipped: *breakdown's own story template already
  // carries a Priority and a Dependencies field per story, so re-running
  // them would restate rather than add.
  { phase: "backlog", agentId: "backlog", commands: ["*breakdown", "*estimate", "*staffing", "*sprint", "*trace"] },
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
