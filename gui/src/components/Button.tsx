import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface Props {
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
  title?: string;
  children: ReactNode;
}

export default function Button({
  onClick,
  disabled = false,
  variant = "primary",
  title,
  children,
}: Props) {
  const primary = variant === "primary";

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      title={title}
      whileHover={disabled ? undefined : "hover"}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      variants={{ hover: { y: -1.5 } }}
      transition={{ type: "spring", stiffness: 500, damping: 28 }}
      style={{
        position: "relative",
        overflow: "hidden",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: primary ? "15px 26px" : "8px 14px",
        borderRadius: "var(--dabba-radius-sm)",
        // Disabled needs an outline of its own: in the editorial theme the
        // "muted" background is the same as the panel hosting the button, so
        // without a border the control simply vanishes.
        border: disabled
          ? "1px solid var(--dabba-border)"
          : primary
            ? "none"
            : "1px solid var(--dabba-border)",
        background: disabled ? "transparent" : primary ? "var(--dabba-ink)" : "transparent",
        color: disabled
          ? "var(--dabba-ink-faint)"
          : primary
            ? "var(--dabba-bg)"
            : "var(--dabba-ink-soft)",
        fontSize: primary ? 14 : 13,
        fontWeight: primary ? 600 : 500,
        letterSpacing: primary ? "-0.005em" : 0,
        cursor: disabled ? "default" : "pointer",
        transition: "background 0.25s var(--dabba-ease), color 0.25s var(--dabba-ease)",
      }}
    >
      {/* Sheen sweeping across the button on hover — pure CSS via motion,
          no image and no external dependency. */}
      {!disabled && primary && (
        <motion.span
          aria-hidden
          initial={{ x: "-130%" }}
          variants={{ hover: { x: "130%" } }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.28) 50%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
      )}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, position: "relative" }}>
        {children}
      </span>
    </motion.button>
  );
}
