import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AgentSummary, RunResult } from "../api";
import { extractTextFromFile, runCommand } from "../api";
import ThinkingDots from "./ThinkingDots";
import UploadIcon from "./UploadIcon";

const ACCEPTED_EXTENSIONS = ".pdf,.doc,.docx,.html,.htm,.txt,.md";

interface Props {
  agent: AgentSummary;
}

export default function CommandPanel({ agent }: Props) {
  const [command, setCommand] = useState(agent.commands[0] ?? "");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const { filename, text } = await extractTextFromFile(file);
      setAttachedFile(filename);
      setInput((prev) => (prev ? `${prev}\n\n--- ${filename} ---\n${text}` : `--- ${filename} ---\n${text}`));
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleRun() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await runCommand(agent.id, command, input));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.section
      key={agent.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={{
        background: "var(--dabba-surface)",
        border: "1px solid var(--dabba-border)",
        borderRadius: "var(--dabba-radius)",
        boxShadow: "var(--dabba-shadow)",
        padding: 24,
      }}
    >
      <h2 style={{ fontFamily: "var(--dabba-font-display)", margin: "0 0 4px" }}>
        @{agent.id} <span style={{ color: "var(--dabba-ink-soft)" }}>— {agent.name}</span>
      </h2>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "16px 0" }}>
        {agent.commands.map((c) => {
          const active = c === command;
          return (
            <button
              key={c}
              onClick={() => {
                setCommand(c);
                setResult(null);
              }}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                border: `1px solid ${active ? "var(--dabba-clay)" : "var(--dabba-border)"}`,
                background: active ? "var(--dabba-clay)" : "transparent",
                color: active ? "#fff" : "var(--dabba-ink)",
                fontSize: 13,
                cursor: "pointer",
                transition: "background 0.15s ease, border-color 0.15s ease",
              }}
            >
              {c}
            </button>
          );
        })}
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={4}
        placeholder="Contexto para o comando (opcional) — ou anexe um arquivo"
        style={{
          width: "100%",
          resize: "vertical",
          padding: 12,
          borderRadius: 10,
          border: "1px solid var(--dabba-border)",
          fontFamily: "inherit",
          fontSize: 14,
          background: "var(--dabba-bg)",
        }}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        onChange={handleFileSelected}
        style={{ display: "none" }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Anexar PDF, DOCX, HTML ou TXT/MD"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid var(--dabba-border)",
            background: "var(--dabba-surface)",
            color: "var(--dabba-ink-soft)",
            fontSize: 13,
            cursor: uploading ? "default" : "pointer",
          }}
        >
          {uploading ? <ThinkingDots /> : <UploadIcon />}
          {uploading ? "Lendo arquivo…" : "Anexar arquivo"}
        </button>

        {attachedFile && !uploading && (
          <span style={{ fontSize: 12, color: "var(--dabba-sage)" }}>Anexado: {attachedFile}</span>
        )}
        {uploadError && (
          <span style={{ fontSize: 12, color: "var(--dabba-clay-dark)" }}>{uploadError}</span>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <motion.button
          onClick={handleRun}
          disabled={loading}
          whileHover={{ y: loading ? 0 : -1 }}
          whileTap={{ scale: loading ? 1 : 0.97 }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            borderRadius: 999,
            border: "none",
            background: "var(--dabba-clay)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.85 : 1,
          }}
        >
          {loading ? <ThinkingDots /> : "Executar"}
        </motion.button>
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.p
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ color: "var(--dabba-clay-dark)", marginTop: 16 }}
          >
            {error}
          </motion.p>
        )}

        {result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{ marginTop: 20 }}
          >
            <span
              style={{
                display: "inline-block",
                fontSize: 12,
                padding: "2px 10px",
                borderRadius: 999,
                background: result.mode === "live" ? "var(--dabba-sage)" : "var(--dabba-surface-muted)",
                color: result.mode === "live" ? "#fff" : "var(--dabba-ink-soft)",
                marginBottom: 8,
              }}
            >
              {result.mode}{result.provider ? ` · ${result.provider}` : ""}{result.model ? ` · ${result.model}` : ""}
            </span>

            {!!result.fallbackAttempts?.length && (
              <p style={{ fontSize: 12, color: "var(--dabba-ink-soft)", margin: "0 0 8px" }}>
                Fallback: {result.fallbackAttempts.map((a) => `${a.model} (${a.status})`).join(" → ")} → {result.model} ✓
              </p>
            )}

            <pre
              style={{
                whiteSpace: "pre-wrap",
                background: "var(--dabba-bg)",
                border: "1px solid var(--dabba-border)",
                borderRadius: 10,
                padding: 16,
                fontSize: 13,
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {result.output}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
