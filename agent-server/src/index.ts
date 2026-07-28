import express from "express";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 8765);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", agents: ["discovery", "prd", "architect", "backlog", "business-case"] });
});

app.listen(PORT, () => {
  console.log(`agent-server listening on http://localhost:${PORT}`);
});
