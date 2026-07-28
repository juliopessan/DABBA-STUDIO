import express from "express";
import { listAgents, getAgent } from "./agents/registry.js";
import { runAgentCommand } from "./llm/provider.js";

const app = express();
app.use(express.json());
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

app.listen(PORT, () => {
  console.log(`agent-server listening on http://localhost:${PORT}`);
});
