import { motion } from "framer-motion";
import type { PipelineArtifact } from "../api";
import { PHASES } from "../phases";
import PhaseNode from "./PhaseNode";

interface Props {
  artifacts: PipelineArtifact[];
  status: "idle" | "running" | "done" | "failed";
}

export default function PhaseTimeline({ artifacts, status }: Props) {
  const doneCount = artifacts.length;
  const progress = doneCount / PHASES.length;

  return (
    <div style={{ position: "relative", marginTop: 8 }}>
      {/* Vertical rail linking the phases; the filled part grows as each
          phase completes. */}
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
            // Transform-only entrance, like the rest of the UI: with an
            // opacity gate the row disappears if rAF is suspended (window in
            // the background) and the animation freezes near zero — which is
            // exactly what happened to the running phase. The "pending" dim
            // still applies, but starting from 1, never from 0.
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
            <PhaseNode
              agentId={phase.agent}
              state={artifact ? "done" : isCurrent ? "running" : "pending"}
            />

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
              {artifact && (
                <div
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
                </div>
              )}
            </div>

            {isFailed && (
              <span className="dabba-eyebrow" style={{ fontSize: 10, color: "var(--dabba-clay-dark)" }}>
                failed
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
