import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { fetchAgents, type AgentSummary } from "./api";
import AgentGrid from "./components/AgentGrid";
import CommandPanel from "./components/CommandPanel";

export default function App() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents()
      .then(setAgents)
      .catch((err) => setError(`Falha ao conectar ao agent-server: ${err.message}`));
  }, []);

  const agent = agents.find((a) => a.id === selectedId) ?? null;

  return (
    <main
      style={{
        maxWidth: 880,
        margin: "0 auto",
        padding: "56px 24px 80px",
      }}
    >
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{ marginBottom: 32 }}
      >
        <h1
          style={{
            fontFamily: "var(--dabba-font-display)",
            fontSize: 40,
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          DABBA <span style={{ color: "var(--dabba-clay)" }}>Studio</span>
        </h1>
        <p style={{ color: "var(--dabba-ink-soft)", marginTop: 6, fontSize: 15 }}>
          Discovery, Architecture, Backlog and Business Analysis
        </p>
      </motion.header>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ color: "var(--dabba-clay-dark)" }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <AgentGrid agents={agents} selectedId={selectedId} onSelect={setSelectedId} />

      <div style={{ marginTop: 20 }}>
        <AnimatePresence mode="wait">
          {agent && <CommandPanel key={agent.id} agent={agent} />}
        </AnimatePresence>
      </div>
    </main>
  );
}
