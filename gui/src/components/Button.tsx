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
        padding: primary ? "11px 22px" : "7px 14px",
        borderRadius: 999,
        border: primary ? "none" : "1px solid var(--dabba-border-strong)",
        background: disabled
          ? "var(--dabba-surface-muted)"
          : primary
            ? "linear-gradient(135deg, var(--dabba-clay), var(--dabba-clay-dark))"
            : "var(--dabba-surface)",
        color: disabled ? "var(--dabba-ink-faint)" : primary ? "#fff" : "var(--dabba-ink-soft)",
        fontSize: primary ? 14 : 13,
        fontWeight: primary ? 600 : 500,
        cursor: disabled ? "default" : "pointer",
        boxShadow: disabled ? "none" : primary ? "var(--dabba-shadow-sm)" : "none",
        transition: "background 0.25s var(--dabba-ease), color 0.25s var(--dabba-ease)",
      }}
    >
      {/* Brilho que atravessa o botão no hover — puro CSS via motion,
          sem imagem nem dependência externa. */}
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
