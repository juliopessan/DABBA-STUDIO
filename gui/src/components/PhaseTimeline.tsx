import { AnimatePresence, motion } from "framer-motion";
import type { PipelineArtifact } from "../api";
import { AgentIcon } from "./icons";
import CheckMark from "./CheckMark";

const PHASES = [
  { id: "discovery", label: "Discovery", agent: "discovery" },
  { id: "prd", label: "PRD", agent: "prd" },
  { id: "architecture", label: "Architecture", agent: "architect" },
  { id: "backlog", label: "Backlog", agent: "backlog" },
  { id: "business-case", label: "Business Case", agent: "business-case" },
];

interface Props {
  artifacts: PipelineArtifact[];
  status: "idle" | "running" | "done" | "failed";
}

export default function PhaseTimeline({ artifacts, status }: Props) {
  const doneCount = artifacts.length;
  const progress = doneCount / PHASES.length;

  return (
    <div style={{ position: "relative", marginTop: 8 }}>
      {/* Trilho vertical ligando as fases; a parte preenchida cresce
          conforme cada fase conclui. */}
      <div
        style={{
          position: "absolute",
          left: 15,
          top: 18,
          bottom: 18,
          width: 1,
          background: "var(--dabba-border)",
        }}
      />
      <motion.div
        initial={{ scaleY: 0 }}
        animate={{ scaleY: progress }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        style={{
          position: "absolute",
          left: 15,
          top: 18,
          bottom: 18,
          width: 1,
          transformOrigin: "top",
          background: "var(--dabba-clay)",
        }}
      />

      {PHASES.map((phase, i) => {
        const artifact = artifacts.find((a) => a.phase === phase.id);
        const isCurrent = status === "running" && !artifact && doneCount === i;
        const isFailed = status === "failed" && !artifact && doneCount === i;
        const pending = !artifact && !isCurrent && !isFailed;

        return (
          <motion.div
            key={phase.id}
            // Entrada só por transform, como no resto da UI: com gate de
            // opacidade a linha some se o rAF for suspenso (janela em
            // segundo plano) e a animação congelar perto de zero — foi
            // exatamente o que aconteceu com a fase em execução. O dimming
            // de "pendente" continua, mas partindo de 1, nunca de 0.
            initial={{ x: -8 }}
            animate={{ opacity: pending ? 0.5 : 1, x: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 0",
            }}
          >
            {/* Nó da timeline */}
            <div
              style={{
                position: "relative",
                width: 32,
                height: 32,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                background: artifact
                  ? "var(--dabba-sage-tint)"
                  : isCurrent
                    ? "var(--dabba-clay-tint)"
                    : "var(--dabba-bg)",
                border: `1.5px solid ${
                  artifact
                    ? "var(--dabba-sage)"
                    : isCurrent
                      ? "var(--dabba-clay)"
                      : "var(--dabba-border)"
                }`,
                color: isCurrent ? "var(--dabba-clay)" : "var(--dabba-ink-faint)",
                flexShrink: 0,
                zIndex: 1,
                transition: "background 0.3s var(--dabba-ease), border-color 0.3s var(--dabba-ease)",
              }}
            >
              {/* Pulso de "em execução" irradiando do nó ativo */}
              {isCurrent && (
                <motion.span
                  animate={{ scale: [1, 1.75], opacity: [0.5, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                  style={{
                    position: "absolute",
                    inset: -1.5,
                    borderRadius: "50%",
                    border: "1.5px solid var(--dabba-clay)",
                  }}
                />
              )}
              <AnimatePresence mode="wait">
                {artifact ? (
                  <motion.span key="done" style={{ display: "grid", placeItems: "center" }}>
                    <CheckMark size={18} />
                  </motion.span>
                ) : (
                  <motion.span
                    key="icon"
                    exit={{ scale: 0, opacity: 0 }}
                    style={{ display: "grid", placeItems: "center" }}
                  >
                    <AgentIcon id={phase.agent} size={16} strokeWidth={1.8} />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span
                  className="dabba-eyebrow"
                  style={{
                    fontSize: 10.5,
                    color: artifact || isCurrent ? "var(--dabba-clay)" : "var(--dabba-ink-faint)",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className="dabba-display"
                  style={{
                    fontSize: 16,
                    letterSpacing: "-0.02em",
                    color: isCurrent ? "var(--dabba-clay)" : "var(--dabba-ink)",
                    transition: "color 0.3s var(--dabba-ease)",
                  }}
                >
                  {phase.label}
                </span>
              </div>
              <AnimatePresence>
                {artifact && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    style={{
                      fontSize: 11,
                      color: "var(--dabba-ink-faint)",
                      fontFamily: "var(--dabba-font-mono)",
                      marginTop: 4,
                      marginLeft: 30,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {artifact.model}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {isCurrent && <ThinkingLabel />}
            {isFailed && (
              <span style={{ fontSize: 12, color: "var(--dabba-clay-dark)" }}>falhou</span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function ThinkingLabel() {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0 }}
    >
      <motion.span
        animate={{ opacity: [0.45, 1, 0.45] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        className="dabba-eyebrow"
        style={{ fontSize: 10, color: "var(--dabba-clay)" }}
      >
        gerando
      </motion.span>
    </motion.span>
  );
}
