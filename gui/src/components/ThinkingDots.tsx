import { motion } from "framer-motion";

const dotTransition = (delay: number) => ({
  duration: 0.9,
  repeat: Infinity,
  ease: "easeInOut" as const,
  delay,
});

export default function ThinkingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {[0, 0.15, 0.3].map((delay, i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
          transition={dotTransition(delay)}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--dabba-clay)",
            display: "inline-block",
          }}
        />
      ))}
    </span>
  );
}
