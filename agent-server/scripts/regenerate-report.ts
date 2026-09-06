import { getRun, getArtifacts, updateRunStatus } from "../src/db/sqlite.js";
import { buildConsolidatedReport } from "../src/pipeline/htmlReport.js";
import { loadMermaidRuntime } from "../src/pipeline/mermaidRuntime.js";
import { writeFileSync } from "node:fs";

const runId = process.argv[2];
if (!runId) throw new Error("uso: tsx scripts/regenerate-report.ts <runId>");

const run = getRun(runId);
if (!run) throw new Error(`run not found: ${runId}`);
const artifacts = getArtifacts(runId);
// This script runs outside the normal server boot sequence, so it loads the
// same asset index.ts loads at startup — skipping it would silently degrade
// every regenerated report's diagrams back to source text.
await loadMermaidRuntime();
const html = buildConsolidatedReport(run, artifacts);
writeFileSync(run.report_path!, html, "utf-8");
updateRunStatus(runId, "done", run.report_path!);
console.log("regenerado:", run.report_path);
