import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { isSea } from "node:sea";
import { initAgents, listAgents, getAgent } from "./agents/registry.js";
import { runAgentCommand } from "./llm/provider.js";
import { extractText, isSupportedExtension } from "./upload/extractText.js";
import { startPipeline, PIPELINE_STEPS } from "./pipeline/orchestrator.js";
import { getRun, getArtifacts } from "./db/sqlite.js";
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
  res.json(listAgents().map(({ id, name, commands }) => ({ id, name, commands })));
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
  res.json({
    run,
    artifacts: artifacts.map(({ output, ...rest }) => ({ ...rest, outputPreview: output.slice(0, 240) })),
    reportUrl: run.status === "done" ? `/pipeline/${run.id}/report.html` : null,
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

initAgents().then(() => {
  app.listen(PORT, () => {
    console.log(`agent-server listening on http://localhost:${PORT}`);
  });
});
