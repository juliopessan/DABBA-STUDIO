import { motion } from "framer-motion";
import { AgentIcon } from "./icons";
import CheckMark from "./CheckMark";

const SIZE = 32;
const R = 14.25; // leaves room for the 1.5 stroke inside the box
const CIRC = 2 * Math.PI * R;

// A phase's real duration depends on the model and the size of the RFP, so
// there is no true progress to report. The ring advances to 92% on a
// decelerating ease — it says "in flight" without promising a time we don't
// know — and only closes the circle once the artifact actually lands.
const ESTIMATED_PHASE_MS = 75_000;
const CEILING = 0.92;

interface Props {
  agentId: string;
  state: "done" | "running" | "pending";
}

export default function PhaseNode({ agentId, state }: Props) {
  const done = state === "done";
  const running = state === "running";

  return (
    <div
      style={{
        position: "relative",
        width: SIZE,
        height: SIZE,
        flexShrink: 0,
        zIndex: 1,
        display: "grid",
        placeItems: "center",
      }}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}
        aria-hidden
      >
        {/* ring track */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--dabba-border)"
          strokeWidth={1.5}
        />
        {(running || done) && (
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={done ? "var(--dabba-sage)" : "var(--dabba-clay)"}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            initial={{ strokeDashoffset: CIRC }}
            animate={{ strokeDashoffset: done ? 0 : CIRC * (1 - CEILING) }}
            transition={
              done
                ? { duration: 0.45, ease: "easeOut" }
                : { duration: ESTIMATED_PHASE_MS / 1000, ease: [0.15, 0.85, 0.35, 1] }
            }
          />
        )}
      </svg>

      {/* Disc fill tracking the ring: it eases in slowly while the phase
          runs and settles on its final colour once complete. */}
      <motion.span
        animate={{
          backgroundColor: done
            ? "var(--dabba-sage-tint)"
            : running
              ? "var(--dabba-clay-tint)"
              : "rgba(0,0,0,0)",
        }}
        transition={{ duration: running && !done ? 3.5 : 0.4, ease: "easeOut" }}
        style={{
          position: "absolute",
          inset: 3,
          borderRadius: "50%",
        }}
      />

      <span
        style={{
          position: "relative",
          display: "grid",
          placeItems: "center",
          color: done
            ? "var(--dabba-sage)"
            : running
              ? "var(--dabba-clay)"
              : "var(--dabba-ink-faint)",
          transition: "color 0.4s var(--dabba-ease)",
        }}
      >
        {done ? <CheckMark size={18} /> : <AgentIcon id={agentId} size={16} strokeWidth={1.8} />}
      </span>
    </div>
  );
}
