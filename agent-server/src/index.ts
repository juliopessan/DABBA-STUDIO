import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { isSea } from "node:sea";
import { initAgents, listAgents, getAgent } from "./agents/registry.js";
import { loadMermaidRuntime } from "./pipeline/mermaidRuntime.js";
import { runAgentCommand } from "./llm/provider.js";
import { extractText, isSupportedExtension } from "./upload/extractText.js";
import { startPipeline, runProposal, proposalReportPath, PIPELINE_STEPS } from "./pipeline/orchestrator.js";
import { getRun, getArtifacts } from "./db/sqlite.js";
import { seedBenchmarkRates, listRates, setRate, getRate, isBenchmarkOnly } from "./db/rateCard.js";
import { priceRun, GRADES, LOCATIONS } from "./pipeline/pricing.js";
import { ENV_FILE } from "./appPaths.js";

// In dev the `.env` lives next to the source (agent-server/.env) — tried
// first so the existing development flow keeps working. Packaged as a Tauri
// sidecar there is no writable "next to the executable"; the user's keys live
// in ~/Library/Application Support/DABBA/.env.
//
// The cwd-relative `.env` is only read in dev: when packaged, the cwd belongs
// to whoever launched the app and may hold another project's `.env`. Since
// dotenv never overwrites an already-defined variable, an empty
// `OPENROUTER_API_KEY=` inherited from that file silenced the user's real key
// and the app fell back to dry-run.
if (!isSea() && existsSync(".env")) dotenv.config({ path: ".env" });
dotenv.config({ path: ENV_FILE });

const app = express();
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  next();
});

const PORT = Number(process.env.PORT ?? 8765);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", agents: listAgents().map((a) => a.id) });
});

app.get("/agents", (_req, res) => {
  // Nick (proposal) is deliberately excluded from the generic single-command
  // grid: running his commands in isolation there produces bare narrative
  // with no team or cost tables, since those are generated from the stored
  // staffing plan and rate card — not from anything a lone `*executive` call
  // has access to. The dedicated POST /pipeline/:id/proposal flow assembles
  // the real document; `getAgent("proposal")` below still serves it.
  res.json(
    listAgents()
      .filter((a) => a.id !== "proposal")
      .map(({ id, name, commands }) => ({ id, name, commands }))
  );
});

app.get("/agents/:id", (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) {
    res.status(404).json({ error: `agent not found: ${req.params.id}` });
    return;
  }
  res.json(agent);
});

app.post("/agents/:id/run", async (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) {
    res.status(404).json({ error: `agent not found: ${req.params.id}` });
    return;
  }

  const { command, input } = req.body as { command?: string; input?: string };
  if (!command || !agent.commands.includes(command)) {
    res.status(400).json({
      error: `invalid command for agent ${agent.id}`,
      validCommands: agent.commands,
    });
    return;
  }

  try {
    const result = await runAgentCommand({ systemPrompt: agent.persona, command, input });
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

app.post("/extract-text", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "no file provided (field 'file')" });
    return;
  }

  const extension = path.extname(req.file.originalname).slice(1);
  if (!isSupportedExtension(extension)) {
    res.status(415).json({
      error: `Unsupported format .${extension}. Use PDF, DOCX, HTML or TXT/MD.`,
    });
    return;
  }

  try {
    const text = await extractText(req.file.buffer, extension);
    res.json({ filename: req.file.originalname, text });
  } catch (error) {
    res.status(422).json({ error: (error as Error).message });
  }
});

app.post("/pipeline/run", (req, res) => {
  const { projectName, rfpText } = req.body as { projectName?: string; rfpText?: string };
  if (!projectName || !rfpText) {
    res.status(400).json({ error: "projectName and rfpText are required" });
    return;
  }

  const run = startPipeline(projectName, rfpText);
  res.status(202).json({
    runId: run.id,
    status: run.status,
    steps: PIPELINE_STEPS.map((s) => ({ phase: s.phase, agentId: s.agentId, commands: s.commands })),
  });
});

app.get("/pipeline/:id", (req, res) => {
  const run = getRun(req.params.id);
  if (!run) {
    res.status(404).json({ error: `run not found: ${req.params.id}` });
    return;
  }
  const artifacts = getArtifacts(req.params.id);
  const hasProposal = artifacts.some((a) => a.phase === "proposal");
  res.json({
    run,
    artifacts: artifacts.map(({ output, ...rest }) => ({ ...rest, outputPreview: output.slice(0, 240) })),
    reportUrl: run.status === "done" ? `/pipeline/${run.id}/report.html` : null,
    proposalReportUrl: hasProposal ? `/pipeline/${run.id}/proposal.html` : null,
  });
});

app.get("/pipeline/:id/report.html", (req, res) => {
  const run = getRun(req.params.id);
  if (!run || !run.report_path) {
    res.status(404).send("The report is not available for this run yet.");
    return;
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(readFileSync(run.report_path, "utf-8"));
});

// A separate document from report.html (see htmlReport.ts's buildProposalReport
// comment for why): the client-facing proposal should not sit behind the same
// link as the internal five-phase trace, and regenerating one must never
// silently rewrite the other.
app.get("/pipeline/:id/proposal.html", (req, res) => {
  const run = getRun(req.params.id);
  if (!run) {
    res.status(404).send("Run not found.");
    return;
  }
  const filePath = proposalReportPath(run.id);
  if (!existsSync(filePath)) {
    res.status(404).send("No proposal has been generated for this run yet.");
    return;
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(readFileSync(filePath, "utf-8"));
});

app.get("/rate-card", (_req, res) => {
  res.json({ grades: GRADES, locations: LOCATIONS, rates: listRates() });
});

app.put("/rate-card", (req, res) => {
  const { grade, location, hourlyRate, currency, note } = req.body ?? {};
  if (!GRADES.includes(grade) || !LOCATIONS.includes(location)) {
    res.status(400).json({ error: `grade must be one of ${GRADES.join(", ")} and location one of ${LOCATIONS.join(", ")}` });
    return;
  }
  if (typeof hourlyRate !== "number" || !Number.isFinite(hourlyRate) || hourlyRate <= 0) {
    res.status(400).json({ error: "hourlyRate must be a positive number" });
    return;
  }
  setRate(grade, location, hourlyRate, currency, note);
  res.json({ rates: listRates() });
});

// Costing is a read over a finished run: it prices the stored staffing plan and
// never calls a model, so it can be re-requested as often as the rate card
// changes without spending a token.
app.get("/pipeline/:id/costing", (req, res) => {
  const run = getRun(req.params.id);
  if (!run) {
    res.status(404).json({ error: `run not found: ${req.params.id}` });
    return;
  }
  const location = typeof req.query.location === "string" ? req.query.location : "onshore";
  const backlog = getArtifacts(run.id).find((a) => a.phase === "backlog");
  res.json(priceRun(backlog?.output, location, getRate, isBenchmarkOnly()));
});

// Opt-in, and only after the analysis is finished: the proposal reads the
// artifacts and never writes back into them.
app.post("/pipeline/:id/proposal", async (req, res) => {
  const run = getRun(req.params.id);
  if (!run) {
    res.status(404).json({ error: `run not found: ${req.params.id}` });
    return;
  }
  if (run.status !== "done") {
    res.status(409).json({ error: "the analysis is not finished yet, so there is nothing to build a proposal from" });
    return;
  }

  const location = typeof req.body?.location === "string" ? req.body.location : "onshore";
  const backlog = getArtifacts(run.id).find((a) => a.phase === "backlog");
  const costing = priceRun(backlog?.output, location, getRate, isBenchmarkOnly());

  try {
    const artifact = await runProposal(run.id, costing);
    res.json({
      proposal: { ...artifact, output: undefined, length: artifact.output.length },
      costing,
      reportUrl: `/pipeline/${run.id}/proposal.html`,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

Promise.all([initAgents(), loadMermaidRuntime()]).then(() => {
  seedBenchmarkRates();
  app.listen(PORT, () => {
    console.log(`agent-server listening on http://localhost:${PORT}`);
  });
});
