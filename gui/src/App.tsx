import { useEffect, useState } from "react";
import { fetchAgents, runCommand, type AgentSummary, type RunResult } from "./api";

export default function App() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [command, setCommand] = useState<string>("");
  const [input, setInput] = useState<string>("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAgents()
      .then(setAgents)
      .catch((err) => setError(`Falha ao conectar ao agent-server: ${err.message}`));
  }, []);

  const agent = agents.find((a) => a.id === selectedAgent);

  async function handleRun() {
    if (!selectedAgent || !command) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await runCommand(selectedAgent, command, input));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 900, margin: "0 auto" }}>
      <h1>DABBA Studio</h1>
      <p style={{ color: "#666" }}>Discovery, Architecture, Backlog and Business Analysis</p>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <section style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "1rem 0" }}>
        {agents.map((a) => (
          <button
            key={a.id}
            onClick={() => {
              setSelectedAgent(a.id);
              setCommand(a.commands[0] ?? "");
              setResult(null);
            }}
            style={{
              padding: "0.5rem 1rem",
              fontWeight: a.id === selectedAgent ? "bold" : "normal",
              border: "1px solid #ccc",
              borderRadius: 6,
              background: a.id === selectedAgent ? "#eee" : "white",
              cursor: "pointer",
            }}
          >
            @{a.id} — {a.name}
          </button>
        ))}
      </section>

      {agent && (
        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem" }}>
          <h2>@{agent.id} — {agent.name}</h2>

          <label>
            Comando
            <select value={command} onChange={(e) => setCommand(e.target.value)} style={{ display: "block", marginBottom: "0.5rem" }}>
              {agent.commands.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label>
            Input
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={4}
              style={{ display: "block", width: "100%", marginBottom: "0.5rem" }}
              placeholder="Contexto para o comando (opcional)"
            />
          </label>

          <button onClick={handleRun} disabled={loading}>
            {loading ? "Executando…" : "Executar"}
          </button>

          {result && (
            <div style={{ marginTop: "1rem" }}>
              <p><strong>Modo:</strong> {result.mode}{result.model ? ` (${result.model})` : ""}</p>
              <pre style={{ whiteSpace: "pre-wrap", background: "#f7f7f7", padding: "1rem", borderRadius: 6 }}>
                {result.output}
              </pre>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
