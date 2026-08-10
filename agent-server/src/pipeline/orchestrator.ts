import { getAgent } from "../agents/registry.js";
import { runAgentCommand } from "../llm/provider.js";
import { createRun, saveArtifact, updateRunStatus, getArtifacts, getRun, type PipelineRun } from "../db/sqlite.js";
import { buildConsolidatedReport } from "./htmlReport.js";
import { unwrapOuterCodeFence } from "./markdown.js";
import { looksLikePersonaEcho } from "./quality.js";
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

// A phase that chains commands asks each one for a distinct section, and the
// personas say so explicitly — but a small free model routinely ignores that
// and re-emits the whole document template on every command (measured: one
// backlog artifact carried two "Effort Estimation" sections quoting 84 and 107
// total points, and three different "Staffing Plans"). Contradictory numbers
// under the same heading are worse than a missing section: the reader has no
// way to tell which is authoritative. The prompt asks; this guarantees.
//
// The LAST occurrence wins, because that is the output of the command that
// actually owns the section (*estimate's estimation is more considered than
// the one *breakdown tacked on). Dropping the earlier copies in place also
// leaves the surviving sections in a sensible order, since a phase's dedicated
// commands run after the broad one.
//
// Only H2 (`## `) headings are compared: they are the section boundaries these
// personas use, while H3 sub-headings ("Key Considerations") legitimately
// repeat under different parents.
function dedupeRepeatedSections(markdown: string): string {
  const lines = markdown.split("\n");

  // A `## ` line inside a fenced block is code, not a heading.
  const headingAt: string[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("```")) inFence = !inFence;
    const match = !inFence && /^##\s+(.*)$/.exec(trimmed);
    headingAt[i] = match ? match[1].trim().toLowerCase().replace(/\s+/g, " ") : "";
  }

  const lastIndexOf = new Map<string, number>();
  headingAt.forEach((h, i) => {
    if (h) lastIndexOf.set(h, i);
  });

  const kept: string[] = [];
  let dropping = false;
  for (let i = 0; i < lines.length; i++) {
    const heading = headingAt[i];
    if (heading) dropping = lastIndexOf.get(heading) !== i;
    if (!dropping) kept.push(lines[i]);
  }
  return kept.join("\n");
}

// Each phase used to receive exactly one thing: the previous phase's full
// output. That works while the artifacts are small, and fails completely once
// they are not. Measured on a real run of an AI-governance RFP: discovery
// (5k chars) → PRD (9k) → architecture (29k) all stayed on topic, then the
// backlog — the first phase handed a 29k input — produced stories about
// booking clinic appointments, and the business case inherited the invention
// and costed it. Two phases of a client deliverable described a product that
// was never requested. A small free model does not fail loudly when its
// context is overrun; it quietly writes a generic project instead.
//
// The fix is two-part, and the first part matters most: the source RFP is the
// only statement of what the project actually IS, so it now anchors EVERY
// phase rather than only discovery. Previously, if one artifact drifted,
// nothing downstream could detect or recover from it — each phase simply
// trusted its predecessor. Second, the carried artifact is bounded, dropping
// fenced blocks first: Mermaid diagrams are half the size of a typical
// architecture document and are the least useful part of it to a backlog or
// business-case agent, which needs the decisions and tables, not the drawings.
const RFP_ANCHOR_BUDGET = 6000;
const CARRIED_CONTEXT_BUDGET = 10000;

function truncateAt(text: string, budget: number): string {
  if (text.length <= budget) return text;
  // Cut at a paragraph boundary when one is available near the limit, so the
  // context does not end mid-sentence.
  const slice = text.slice(0, budget);
  const lastBreak = slice.lastIndexOf("\n\n");
  const body = lastBreak > budget * 0.6 ? slice.slice(0, lastBreak) : slice;
  return `${body}\n\n[…truncated for context length…]`;
}

function stripFencedBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, "[diagram omitted]");
}

function buildPhaseInput(rfpText: string, previousOutput: string | null): string {
  const brief = `# Source RFP (authoritative — this is the project)\n\n${truncateAt(rfpText, RFP_ANCHOR_BUDGET)}`;
  if (previousOutput === null) return brief;

  let carried = previousOutput;
  if (carried.length > CARRIED_CONTEXT_BUDGET) carried = stripFencedBlocks(carried);
  carried = truncateAt(carried, CARRIED_CONTEXT_BUDGET);

  return `${brief}\n\n---\n\n# Previous phase output\n\n${carried}`;
}

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
  let previousOutput: string | null = null;

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
    // alone. That accumulation is bounded by the same budget as the
    // cross-phase hand-off: architecture chains six commands, so an unbounded
    // accumulator overruns the context before the phase even ends.
    const baseInput = buildPhaseInput(rfpText, previousOutput);
    let phaseInput = baseInput;
    const sections: string[] = [];
    let lastProvider: string | undefined;
    let lastModel: string | undefined;

    for (const command of step.commands) {
      let result;
      // A persona echo is a total loss for that command — the artifact becomes
      // the instructions instead of the deliverable — but it is intermittent,
      // so simply asking again usually lands a real answer. Two extra attempts
      // (three total): beyond that the phase is likely to keep failing the same
      // way and further retries only burn time. If all three echo, the last one
      // is kept rather than aborting the run: the remaining phases still carry
      // value, and buildQualityReport surfaces the problem in the report.
      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; ; attempt++) {
        try {
          result = await runAgentCommand({ systemPrompt: agent.persona, command, input: phaseInput, autoMode: true });
        } catch (error) {
          updateRunStatus(runId, "failed");
          throw error;
        }
        if (attempt >= MAX_ATTEMPTS || !looksLikePersonaEcho(result.output, agent.persona)) break;
        console.warn(
          `[${step.phase}] ${command}: response echoed the persona instead of producing the artifact — retrying (${attempt}/${MAX_ATTEMPTS - 1})`
        );
      }
      // Unwrap the outer fence (if any) BEFORE concatenating — each command
      // produces its own response with its own individual fence; if we
      // concatenated first, the combined text would hold multiple fence pairs
      // and the unwrap heuristic (which only fires on exactly 1 pair) would
      // stop triggering for any of them.
      sections.push(unwrapOuterCodeFence(result.output));
      // Append this phase's work so far to the base context rather than
      // replacing it. The previous version assigned the accumulated sections
      // straight over phaseInput, so from the second command onwards the agent
      // lost both the RFP and the preceding phase — *estimate was reasoning
      // about story points with no sight of the requirements that produced
      // them.
      phaseInput = `${baseInput}\n\n---\n\n# Earlier output from this phase\n\n${truncateAt(
        stripFencedBlocks(sections.join("\n\n")),
        CARRIED_CONTEXT_BUDGET
      )}`;
      lastProvider = result.provider;
      lastModel = result.model;
    }

    // Unwrap a SECOND time, now on the joined text. Each section was already
    // unwrapped on its own, but a fence the model left unclosed in one section
    // can pair with a stray one from the next after concatenation, forming a
    // phantom code block spanning the seam — which then hides every heading
    // inside it from the de-duplication below (and from anything else that
    // reads structure).
    const combinedOutput = dedupeRepeatedSections(unwrapOuterCodeFence(sections.join("\n\n")));
    saveArtifact(runId, step.phase, step.agentId, step.commands.join(" → "), combinedOutput, lastProvider, lastModel);
    previousOutput = combinedOutput;
  }

  const run = getRun(runId);
  if (!run) throw new Error(`run not found after processing: ${runId}`);
  const artifacts = getArtifacts(runId);
  const html = buildConsolidatedReport(run, artifacts);

  const reportPath = path.join(OUTPUT_DIR, `${runId}.html`);
  writeFileSync(reportPath, html, "utf-8");
  updateRunStatus(runId, "done", reportPath);
}
