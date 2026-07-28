import { motion } from "framer-motion";
import type { AgentSummary } from "../api";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
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
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 12,
      }}
    >
      {agents.map((a) => {
        const active = a.id === selectedId;
        return (
          <motion.button
            key={a.id}
            variants={item}
            layout
            onClick={() => onSelect(a.id)}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            style={{
              textAlign: "left",
              padding: "16px",
              borderRadius: "var(--dabba-radius)",
              border: `1px solid ${active ? "var(--dabba-clay)" : "var(--dabba-border)"}`,
              background: active ? "var(--dabba-clay-tint)" : "var(--dabba-surface)",
              boxShadow: active ? "none" : "var(--dabba-shadow)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <div style={{ fontSize: 12, color: "var(--dabba-ink-soft)", marginBottom: 4 }}>
              @{a.id}
            </div>
            <div style={{ fontFamily: "var(--dabba-font-display)", fontSize: 20 }}>{a.name}</div>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
