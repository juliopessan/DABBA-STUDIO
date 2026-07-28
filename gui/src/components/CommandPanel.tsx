import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AgentSummary, RunResult } from "../api";
import { extractTextFromFile, runCommand } from "../api";
import { useFileDrop } from "../useFileDrop";
import ThinkingDots from "./ThinkingDots";
import Button from "./Button";
import { AgentIcon, AlertIcon, FileIcon, PlayIcon, UploadIcon } from "./icons";

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
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ingestFile = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const { filename, text } = await extractTextFromFile(file);
      setAttachedFile(filename);
      setInput((prev) =>
        prev ? `${prev}\n\n--- ${filename} ---\n${text}` : `--- ${filename} ---\n${text}`
      );
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }, []);

  const { dragging, dropHandlers } = useFileDrop(ingestFile);

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) ingestFile(file);
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

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <motion.section
      key={agent.id}
      // Transform-only entrance (never invisible if rAF freezes); the exit
      // keeps its fade, which AnimatePresence needs for the swap
      // suave entre agentes.
      initial={{ y: 14 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
      style={{
        background: "var(--dabba-surface)",
        border: "1px solid var(--dabba-border)",
        borderRadius: "var(--dabba-radius)",
        boxShadow: "var(--dabba-shadow)",
        padding: 26,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 40,
            height: 40,
            borderRadius: 12,
            background: "var(--dabba-clay)",
            color: "#fff",
            flexShrink: 0,
          }}
        >
          <AgentIcon id={agent.id} size={21} />
        </span>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--dabba-ink-faint)" }}>@{agent.id}</div>
          <h2
            style={{
              fontFamily: "var(--dabba-font-display)",
              fontSize: 22,
              fontWeight: 600,
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {agent.name}
          </h2>
        </div>
      </div>

      {/* Pills de comando com indicador deslizante compartilhado */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "20px 0 14px" }}>
        {agent.commands.map((c) => {
          const active = c === command;
          return (
            <motion.button
              key={c}
              onClick={() => {
                setCommand(c);
                setResult(null);
              }}
              whileTap={{ scale: 0.95 }}
              style={{
                position: "relative",
                padding: "7px 15px",
                borderRadius: 999,
                border: `1px solid ${active ? "transparent" : "var(--dabba-border)"}`,
                background: "transparent",
                color: active ? "#fff" : "var(--dabba-ink-soft)",
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                transition: "color 0.25s var(--dabba-ease)",
              }}
            >
              {active && (
                <motion.span
                  layoutId={`cmd-pill-${agent.id}`}
                  transition={{ type: "spring", stiffness: 480, damping: 36 }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 999,
                    background: "linear-gradient(135deg, var(--dabba-clay), var(--dabba-clay-dark))",
                  }}
                />
              )}
              {/* Above the indicator: a negative z-index would push it behind
                  the whole card, hiding the pill. */}
              <span style={{ position: "relative", zIndex: 1 }}>{c}</span>
            </motion.button>
          );
        })}
      </div>

      <div style={{ position: "relative" }} {...dropHandlers}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          placeholder="Context for the command (optional) — or drop a file"
          style={{
            width: "100%",
            resize: "vertical",
            padding: "13px 14px",
            borderRadius: "var(--dabba-radius-sm)",
            border: `1px solid ${dragging ? "var(--dabba-clay)" : "var(--dabba-border)"}`,
            fontSize: 14,
            lineHeight: 1.6,
            background: "var(--dabba-bg)",
            display: "block",
          }}
        />
        <AnimatePresence>
          {dragging && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "var(--dabba-radius-sm)",
                border: "2px dashed var(--dabba-clay)",
                background: "var(--dabba-clay-tint)",
                display: "grid",
                placeItems: "center",
                pointerEvents: "none",
                color: "var(--dabba-clay-dark)",
                fontSize: 13.5,
                fontWeight: 600,
              }}
            >
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                style={{ display: "grid", placeItems: "center", gap: 6 }}
              >
                <UploadIcon size={24} />
                Solte para anexar
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        onChange={handleFileSelected}
        style={{ display: "none" }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <Button
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Anexar PDF, DOCX, HTML ou TXT/MD"
        >
          {uploading ? <ThinkingDots size={5} /> : <UploadIcon />}
          {uploading ? "Reading file…" : "Attach file"}
        </Button>

        <AnimatePresence mode="wait">
          {attachedFile && !uploading && (
            <motion.span
              key={attachedFile}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 11px",
                borderRadius: 999,
                background: "var(--dabba-sage-tint)",
                color: "var(--dabba-sage)",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              <FileIcon size={13} />
              {attachedFile}
            </motion.span>
          )}
          {uploadError && (
            <motion.span
              key="up-err"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "var(--dabba-clay-dark)",
              }}
            >
              <AlertIcon size={14} />
              {uploadError}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div style={{ marginTop: 18 }}>
        <Button onClick={handleRun} disabled={loading}>
          {/* Same reason as the pipeline button: the running state is
              disabled and therefore transparent, so white dots disappear on
              the light theme. */}
          {loading ? <ThinkingDots size={5} /> : <PlayIcon />}
          {loading ? "Running…" : "Run"}
        </Button>
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.p
            key="error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              color: "var(--dabba-clay-dark)",
              marginTop: 16,
              fontSize: 13.5,
            }}
          >
            <AlertIcon />
            {error}
          </motion.p>
        )}

        {result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{ marginTop: 22 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 10,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 11.5,
                  padding: "4px 11px",
                  borderRadius: 999,
                  background:
                    result.mode === "live" ? "var(--dabba-sage-tint)" : "var(--dabba-surface-muted)",
                  color: result.mode === "live" ? "var(--dabba-sage)" : "var(--dabba-ink-soft)",
                  fontWeight: 500,
                  fontFamily: "var(--dabba-font-mono)",
                }}
              >
                <motion.span
                  animate={result.mode === "live" ? { opacity: [1, 0.35, 1] } : undefined}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "currentColor",
                    display: "inline-block",
                  }}
                />
                {result.mode}
                {result.provider ? ` · ${result.provider}` : ""}
                {result.model ? ` · ${result.model}` : ""}
              </span>

              <button
                onClick={handleCopy}
                style={{
                  border: "1px solid var(--dabba-border)",
                  background: "transparent",
                  borderRadius: 999,
                  padding: "4px 12px",
                  fontSize: 12,
                  color: copied ? "var(--dabba-sage)" : "var(--dabba-ink-soft)",
                  cursor: "pointer",
                  transition: "color 0.2s var(--dabba-ease)",
                }}
              >
                {copied ? "copied ✓" : "copy"}
              </button>
            </div>

            {!!result.fallbackAttempts?.length && (
              <p
                style={{
                  fontSize: 11.5,
                  color: "var(--dabba-ink-faint)",
                  margin: "0 0 10px",
                  fontFamily: "var(--dabba-font-mono)",
                }}
              >
                fallback: {result.fallbackAttempts.map((a) => `${a.model} (${a.status})`).join(" → ")} →{" "}
                {result.model} ✓
              </p>
            )}

            <pre
              style={{
                whiteSpace: "pre-wrap",
                background: "var(--dabba-bg)",
                border: "1px solid var(--dabba-border)",
                borderRadius: "var(--dabba-radius-sm)",
                padding: 18,
                fontSize: 13,
                lineHeight: 1.7,
                margin: 0,
                maxHeight: 460,
                overflow: "auto",
                fontFamily: "var(--dabba-font-mono)",
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
