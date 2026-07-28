import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { fetchAgents, type AgentSummary } from "./api";
import { useTheme } from "./useTheme";
import AgentGrid from "./components/AgentGrid";
import CommandPanel from "./components/CommandPanel";
import PipelineRunner from "./components/PipelineRunner";
import { AlertIcon, MoonIcon, SunIcon } from "./components/icons";

export default function App() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    fetchAgents()
      .then(setAgents)
      .catch((err) => setError(`Falha ao conectar ao agent-server: ${err.message}`));
  }, []);

  const agent = agents.find((a) => a.id === selectedId) ?? null;
  const connected = agents.length > 0 && !error;

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "52px 24px 96px" }}>
      <motion.header
        initial={{ y: -10 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 20,
          marginBottom: 36,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--dabba-font-display)",
              fontSize: 44,
              fontWeight: 600,
              margin: 0,
              letterSpacing: "-0.015em",
              lineHeight: 1.05,
            }}
          >
            DABBA{" "}
            <motion.span
              initial={{ x: -6 }}
              animate={{ x: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              style={{
                background: "linear-gradient(120deg, var(--dabba-clay), var(--dabba-clay-dark))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                display: "inline-block",
              }}
            >
              Studio
            </motion.span>
          </h1>
          <p style={{ color: "var(--dabba-ink-soft)", marginTop: 8, fontSize: 15 }}>
            Discovery, Architecture, Backlog and Business Analysis
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, paddingTop: 6 }}>
          <AnimatePresence>
            {connected && (
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                title="agent-server conectado"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11.5,
                  color: "var(--dabba-ink-faint)",
                  fontFamily: "var(--dabba-font-mono)",
                }}
              >
                <motion.span
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--dabba-sage)",
                    display: "inline-block",
                  }}
                />
                {agents.length} agentes
              </motion.span>
            )}
          </AnimatePresence>

          <motion.button
            onClick={toggle}
            whileHover={{ y: -1.5 }}
            whileTap={{ scale: 0.92, rotate: -20 }}
            title={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
            style={{
              display: "grid",
              placeItems: "center",
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid var(--dabba-border)",
              background: "var(--dabba-surface)",
              color: "var(--dabba-ink-soft)",
              cursor: "pointer",
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
                transition={{ duration: 0.22 }}
                style={{ display: "grid", placeItems: "center" }}
              >
                {theme === "dark" ? <SunIcon /> : <MoonIcon />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
      </motion.header>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "13px 16px",
              borderRadius: "var(--dabba-radius-sm)",
              background: "var(--dabba-clay-tint)",
              color: "var(--dabba-clay-dark)",
              fontSize: 13.5,
              marginBottom: 24,
            }}
          >
            <AlertIcon size={17} />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <PipelineRunner />

      <h2
        style={{
          fontFamily: "var(--dabba-font-display)",
          fontSize: 20,
          fontWeight: 600,
          margin: "0 0 4px",
        }}
      >
        Agentes individuais
      </h2>
      <p style={{ color: "var(--dabba-ink-soft)", fontSize: 13, margin: "0 0 16px" }}>
        Execute um comando isolado, sem rodar o pipeline inteiro.
      </p>

      <AgentGrid agents={agents} selectedId={selectedId} onSelect={setSelectedId} />

      <div style={{ marginTop: 20 }}>
        <AnimatePresence mode="wait">
          {agent && <CommandPanel key={agent.id} agent={agent} />}
        </AnimatePresence>
      </div>
    </main>
  );
}
