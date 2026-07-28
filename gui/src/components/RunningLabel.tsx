import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

// One whimsical gerund at a time, in the spirit of Claude Code's spinner.
// Words are grouped by phase — the pipeline already knows where it is, so the
// label can hint at the work actually happening instead of picking at random.
const WORDS: Record<number, string[]> = {
  0: ["Excavating", "Prospecting", "Unearthing", "Sleuthing", "Divining"],
  1: ["Drafting", "Distilling", "Codifying", "Articulating", "Crystallizing"],
  2: ["Blueprinting", "Scaffolding", "Orchestrating", "Composing", "Triangulating"],
  3: ["Slicing", "Sequencing", "Tallying", "Choreographing", "Parcelling"],
  4: ["Tabulating", "Reckoning", "Appraising", "Forecasting", "Weighing"],
};

const FALLBACK = ["Chaining", "Weaving", "Marshalling"];

const ROTATE_MS = 3200;

interface Props {
  phaseIndex: number;
}

export default function RunningLabel({ phaseIndex }: Props) {
  const reduced = useReducedMotion();
  const pool = WORDS[phaseIndex] ?? FALLBACK;
  const [index, setIndex] = useState(0);

  // Reset on phase change so the first word always describes what just
  // started, not whatever was left over from the previous phase.
  const lastPhase = useRef(phaseIndex);
  if (lastPhase.current !== phaseIndex) {
    lastPhase.current = phaseIndex;
    if (index !== 0) setIndex(0);
  }

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % pool.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [pool.length]);

  const word = pool[index % pool.length];

  return (
    <span style={{ display: "inline-flex", overflow: "hidden" }}>
      {/* No AnimatePresence and no opacity gate, deliberately: with
          `mode="wait"` the incoming word only mounts once the outgoing one
          finishes exiting, and that animation rides on rAF — which the browser
          suspends while the window is in the background, freezing the label.
          Here a key change remounts immediately; if rAF is suspended the worst
          case is a word sitting 6px low, never a stale word. */}
      <motion.span
        key={word}
        initial={reduced ? false : { y: 6 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        style={{ whiteSpace: "nowrap" }}
      >
        {word}…
      </motion.span>
    </span>
  );
}
