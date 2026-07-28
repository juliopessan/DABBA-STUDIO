import { motion } from "framer-motion";
import type { AgentSummary } from "../api";
import { AgentIcon } from "./icons";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

// Entrada só por transform (sem opacidade): se o requestAnimationFrame for
// suspenso — janela minimizada, aba em segundo plano — a animação congela
// onde estiver. Sem gate de opacidade o pior caso é o card levemente
// deslocado, nunca invisível.
const item = {
  hidden: { y: 14, scale: 0.97 },
  show: {
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 380, damping: 30 },
  },
};

interface Props {
  agents: AgentSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function AgentGrid({ agents, selectedId, onSelect }: Props) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(196px, 1fr))",
        gap: 12,
      }}
    >
      {agents.map((a) => {
        const active = a.id === selectedId;
        return (
          <motion.button
            key={a.id}
            variants={item}
            onClick={() => onSelect(a.id)}
            aria-label={`${a.name} (@${a.id}), ${a.commands.length} comandos`}
            aria-pressed={active}
            whileHover="hover"
            whileTap={{ scale: 0.975 }}
            style={{
              position: "relative",
              textAlign: "left",
              padding: "16px 16px 18px",
              borderRadius: "var(--dabba-radius)",
              border: `1px solid ${active ? "transparent" : "var(--dabba-border)"}`,
              background: active ? "var(--dabba-clay-tint)" : "var(--dabba-surface)",
              boxShadow: active ? "none" : "var(--dabba-shadow-sm)",
              cursor: "pointer",
              overflow: "hidden",
              transition: "background 0.3s var(--dabba-ease), border-color 0.3s var(--dabba-ease)",
            }}
          >
            {/* Anel de seleção compartilhado: desliza entre os cards em vez
                de piscar, deixando óbvio de onde para onde a seleção foi. */}
            {active && (
              <motion.span
                layoutId="agent-selection-ring"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "var(--dabba-radius)",
                  border: "1.5px solid var(--dabba-clay)",
                  boxShadow: "var(--dabba-glow)",
                  pointerEvents: "none",
                }}
              />
            )}

            <motion.span
              variants={{ hover: { y: -3, rotate: -6 } }}
              transition={{ type: "spring", stiffness: 400, damping: 18 }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 38,
                height: 38,
                borderRadius: 11,
                marginBottom: 12,
                background: active ? "var(--dabba-clay)" : "var(--dabba-bg)",
                color: active ? "#fff" : "var(--dabba-clay)",
                transition: "background 0.3s var(--dabba-ease), color 0.3s var(--dabba-ease)",
              }}
            >
              <AgentIcon id={a.id} />
            </motion.span>

            <div style={{ fontSize: 11.5, color: "var(--dabba-ink-faint)", letterSpacing: "0.02em" }}>
              @{a.id}
            </div>
            <div
              style={{
                fontFamily: "var(--dabba-font-display)",
                fontSize: 21,
                fontWeight: 600,
                marginTop: 1,
              }}
            >
              {a.name}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--dabba-ink-faint)", marginTop: 6 }}>
              {a.commands.length} comandos
            </div>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
