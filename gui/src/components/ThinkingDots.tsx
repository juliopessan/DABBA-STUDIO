import { motion } from "framer-motion";

interface Props {
  color?: string;
  size?: number;
}

export default function ThinkingDots({ color = "var(--dabba-clay)", size = 6 }: Props) {
  return (
    <span style={{ display: "inline-flex", gap: size * 0.7, alignItems: "center" }}>
      {[0, 0.15, 0.3].map((delay, i) => (
        <motion.span
          key={i}
          // Floor at 0.45, not 0.25: lower than this the accent reads as
          // washed-out grey at the bottom of the pulse instead of orange.
          animate={{ opacity: [0.45, 1, 0.45], y: [0, -3, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay }}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: color,
            display: "inline-block",
          }}
        />
      ))}
    </span>
  );
}
