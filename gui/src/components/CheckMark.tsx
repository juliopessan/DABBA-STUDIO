import { motion } from "framer-motion";

interface Props {
  size?: number;
}

// Check desenhado com pathLength — o traço "se escreve" quando a fase
// conclui, em vez de aparecer de uma vez.
export default function CheckMark({ size = 18 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <motion.circle
        cx="12"
        cy="12"
        r="10"
        fill="var(--dabba-sage)"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 22 }}
      />
      <motion.path
        d="M7.5 12.5l3 3 6-6.5"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.32, ease: "easeOut", delay: 0.12 }}
      />
    </svg>
  );
}
