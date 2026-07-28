import express from "express";
import { listAgents, getAgent } from "./agents/registry.js";

const app = express();
app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`agent-server listening on http://localhost:${PORT}`);
});
