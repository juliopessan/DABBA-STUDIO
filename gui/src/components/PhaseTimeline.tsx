import { motion } from "framer-motion";
import type { PipelineArtifact } from "../api";
import { PHASES } from "../phases";
import PhaseNode from "./PhaseNode";

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

/**
 * Per-phase duration from the timestamps we already have: a phase lasts from
 * when the previous one finished until its own artifact lands — the first one
 * counts from the start of the run. Phases execute strictly in sequence, so
 * walking the canonical order and stopping at the first gap is enough.
 */
function phaseDurations(
  artifacts: PipelineArtifact[],
  runStartedAt: string | null
): Map<string, number> {
  const out = new Map<string, number>();
  let prev = runStartedAt ? Date.parse(runStartedAt) : NaN;

  for (const phase of PHASES) {
    const artifact = artifacts.find((a) => a.phase === phase.id);
    if (!artifact) break;
    const at = Date.parse(artifact.created_at);
    if (!Number.isNaN(prev) && !Number.isNaN(at)) out.set(phase.id, Math.max(0, at - prev));
    prev = at;
  }
  return out;
}

interface Props {
  artifacts: PipelineArtifact[];
  status: "idle" | "running" | "done" | "failed";
  runStartedAt: string | null;
}

export default function PhaseTimeline({ artifacts, status, runStartedAt }: Props) {
  const doneCount = artifacts.length;
  const progress = doneCount / PHASES.length;
  const durations = phaseDurations(artifacts, runStartedAt);

  // Where the phase currently in flight started — lets it show a live count
  // instead of staying blank until it finishes. The parent re-renders once a
  // second while running, which is what advances this.
  const lastFinishedAt = artifacts.length
    ? Date.parse(artifacts[artifacts.length - 1].created_at)
    : runStartedAt
      ? Date.parse(runStartedAt)
      : NaN;

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

            {isFailed ? (
              <span className="dabba-eyebrow" style={{ fontSize: 10, color: "var(--dabba-clay-dark)" }}>
                failed
              </span>
            ) : (
              <PhaseDuration
                ms={
                  artifact
                    ? durations.get(phase.id)
                    : isCurrent && !Number.isNaN(lastFinishedAt)
                      ? Math.max(0, Date.now() - lastFinishedAt)
                      : undefined
                }
                live={isCurrent}
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function PhaseDuration({ ms, live }: { ms: number | undefined; live: boolean }) {
  if (ms === undefined) return null;
  return (
    <span
      // Mono and letter-spaced like the eyebrows, but without their
      // uppercase transform — it would render "30s" as "30S".
      style={{
        fontFamily: "var(--dabba-font-mono)",
        fontSize: 10.5,
        letterSpacing: "0.08em",
        flexShrink: 0,
        fontVariantNumeric: "tabular-nums",
        color: live ? "var(--dabba-clay)" : "var(--dabba-ink-faint)",
      }}
    >
      {formatDuration(ms)}
    </span>
  );
}
