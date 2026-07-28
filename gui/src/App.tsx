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
    // In the packaged app the window opens before the sidecar (a Node
    // binary) finishes booting — the first attempt can land before the port
    // is up (more so on first launch, while Gatekeeper verifies the
    // signature). Without a retry, a startup race becomes a permanent error
    // even though the backend is healthy seconds later.
    let cancelled = false;
    let attempt = 0;
    const MAX_ATTEMPTS = 20;
    const RETRY_DELAY_MS = 1000;

    async function tryFetch() {
      attempt += 1;
      try {
        const data = await fetchAgents();
        if (!cancelled) {
          setAgents(data);
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (attempt >= MAX_ATTEMPTS) {
          setError(`Could not reach the agent-server: ${(err as Error).message}`);
          return;
        }
        setTimeout(tryFetch, RETRY_DELAY_MS);
      }
    }

    tryFetch();
    return () => {
      cancelled = true;
    };
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
          marginBottom: 44,
          paddingBottom: 40,
          borderBottom: "1px solid var(--dabba-border)",
        }}
      >
        <div>
          <div className="dabba-eyebrow">DPABB Framework / DABBA Studio</div>
          <h1 className="dabba-display" style={{ fontSize: 52, margin: "14px 0 0" }}>
            Requirements in.
            <br />
            <motion.span
              initial={{ x: -6 }}
              animate={{ x: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              style={{ color: "var(--dabba-clay)", display: "inline-block" }}
            >
              Decisions out.
            </motion.span>
          </h1>
          <p
            style={{
              color: "var(--dabba-ink-soft)",
              marginTop: 18,
              fontSize: 15,
              lineHeight: 1.6,
              maxWidth: 480,
            }}
          >
            Discovery, Architecture, Backlog and Business Analysis — five chained phases
            that turn an RFP into a traceable document.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, paddingTop: 6 }}>
          <AnimatePresence>
            {connected && (
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                title="agent-server connected"
                className="dabba-eyebrow"
                style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
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
                {agents.length} agents
              </motion.span>
            )}
          </AnimatePresence>

          <motion.button
            onClick={toggle}
            whileHover={{ y: -1.5 }}
            whileTap={{ scale: 0.92, rotate: -20 }}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            style={{
              display: "grid",
              placeItems: "center",
              width: 34,
              height: 34,
              borderRadius: "var(--dabba-radius-sm)",
              border: "1px solid var(--dabba-border)",
              background: "transparent",
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
              borderLeft: "2px solid var(--dabba-clay)",
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

      <div style={{ marginTop: 56, paddingTop: 28, borderTop: "1px solid var(--dabba-border)" }}>
        <div className="dabba-eyebrow">02 / Individual agents</div>
        <h2 className="dabba-display" style={{ fontSize: 30, margin: "12px 0 10px" }}>
          One phase at a time.
        </h2>
        <p style={{ color: "var(--dabba-ink-soft)", fontSize: 14, margin: "0 0 22px", maxWidth: 460 }}>
          Run a single command without kicking off the whole pipeline.
        </p>
      </div>

      <AgentGrid agents={agents} selectedId={selectedId} onSelect={setSelectedId} />

      <div style={{ marginTop: 20 }}>
        <AnimatePresence mode="wait">
          {agent && <CommandPanel key={agent.id} agent={agent} />}
        </AnimatePresence>
      </div>
    </main>
  );
}
