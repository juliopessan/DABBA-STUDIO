import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  extractTextFromFile,
  getPipelineStatus,
  pipelineReportUrl,
  startPipeline,
  type PipelineArtifact,
} from "../api";
import ThinkingDots from "./ThinkingDots";
import UploadIcon from "./UploadIcon";

const PHASE_LABELS: Record<string, string> = {
  discovery: "Discovery",
  prd: "PRD",
  architecture: "Architecture",
  backlog: "Backlog",
  "business-case": "Business Case",
};

const PHASE_ORDER = ["discovery", "prd", "architecture", "backlog", "business-case"];

export default function PipelineRunner() {
  const [projectName, setProjectName] = useState("");
  const [rfpText, setRfpText] = useState("");
  const [attachedFile, setAttachedFile] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [artifacts, setArtifacts] = useState<PipelineArtifact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!runId || status !== "running") return;
    const interval = setInterval(async () => {
      try {
        const data = await getPipelineStatus(runId);
        setArtifacts(data.artifacts);
        if (data.run.status !== "running") {
          setStatus(data.run.status);
          clearInterval(interval);
        }
      } catch (err) {
        setError((err as Error).message);
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [runId, status]);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { filename, text } = await extractTextFromFile(file);
      setAttachedFile(filename);
      setRfpText(text);
      if (!projectName) setProjectName(filename.replace(/\.[^.]+$/, ""));
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleStart() {
    setError(null);
    setArtifacts([]);
    try {
      const { runId } = await startPipeline(projectName || "Projeto sem nome", rfpText);
      setRunId(runId);
      setStatus("running");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const canStart = rfpText.trim().length > 0 && status !== "running";

  return (
    <section
      style={{
        background: "var(--dabba-surface)",
        border: "1px solid var(--dabba-border)",
        borderRadius: "var(--dabba-radius)",
        boxShadow: "var(--dabba-shadow)",
        padding: 24,
        marginBottom: 20,
      }}
    >
      <h2 style={{ fontFamily: "var(--dabba-font-display)", margin: "0 0 4px" }}>Pipeline completo</h2>
      <p style={{ color: "var(--dabba-ink-soft)", fontSize: 13, margin: "0 0 16px" }}>
        Anexe a RFP e rode as 5 fases (Discovery → PRD → Architecture → Backlog → Business Case) de ponta a
        ponta. Cada fase usa o artefato da anterior como premissa; tudo fica salvo em SQLite.
      </p>

      <input
        type="text"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        placeholder="Nome do projeto"
        disabled={status === "running"}
        style={{
          width: "100%",
          padding: 10,
          borderRadius: 10,
          border: "1px solid var(--dabba-border)",
          fontFamily: "inherit",
          fontSize: 14,
          marginBottom: 10,
          background: "var(--dabba-bg)",
        }}
      />

      <textarea
        value={rfpText}
        onChange={(e) => setRfpText(e.target.value)}
        rows={4}
        placeholder="Cole a RFP aqui ou anexe um arquivo (PDF, DOCX, HTML, TXT/MD)"
        disabled={status === "running"}
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
        accept=".pdf,.doc,.docx,.html,.htm,.txt,.md"
        onChange={handleFileSelected}
        style={{ display: "none" }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, marginBottom: 16 }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || status === "running"}
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
          {uploading ? "Lendo arquivo…" : "Anexar RFP"}
        </button>
        {attachedFile && !uploading && (
          <span style={{ fontSize: 12, color: "var(--dabba-sage)" }}>Anexado: {attachedFile}</span>
        )}
        {uploadError && <span style={{ fontSize: 12, color: "var(--dabba-clay-dark)" }}>{uploadError}</span>}
      </div>

      <motion.button
        onClick={handleStart}
        disabled={!canStart}
        whileHover={{ y: canStart ? -1 : 0 }}
        whileTap={{ scale: canStart ? 0.97 : 1 }}
        style={{
          padding: "10px 20px",
          borderRadius: 999,
          border: "none",
          background: canStart ? "var(--dabba-clay)" : "var(--dabba-surface-muted)",
          color: canStart ? "#fff" : "var(--dabba-ink-soft)",
          fontSize: 14,
          fontWeight: 600,
          cursor: canStart ? "pointer" : "default",
        }}
      >
        {status === "running" ? "Executando pipeline…" : "Iniciar Pipeline"}
      </motion.button>

      {error && <p style={{ color: "var(--dabba-clay-dark)", marginTop: 16 }}>{error}</p>}

      {status !== "idle" && (
        <div style={{ marginTop: 20 }}>
          {PHASE_ORDER.map((phase) => {
            const artifact = artifacts.find((a) => a.phase === phase);
            const isCurrent = status === "running" && !artifact && artifacts.length === PHASE_ORDER.indexOf(phase);
            return (
              <div
                key={phase}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom: "1px solid var(--dabba-border)",
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: artifact ? "var(--dabba-sage)" : isCurrent ? "var(--dabba-clay)" : "var(--dabba-border)",
                  }}
                />
                <span style={{ fontSize: 14, minWidth: 130 }}>{PHASE_LABELS[phase]}</span>
                {isCurrent && <ThinkingDots />}
                {artifact && (
                  <span style={{ fontSize: 12, color: "var(--dabba-ink-soft)" }}>
                    {artifact.provider} · {artifact.model}
                  </span>
                )}
              </div>
            );
          })}

          {status === "done" && runId && (
            <motion.a
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              href={pipelineReportUrl(runId)}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                marginTop: 16,
                padding: "10px 20px",
                borderRadius: 999,
                background: "var(--dabba-clay)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Abrir documento consolidado
            </motion.a>
          )}

          {status === "failed" && (
            <p style={{ color: "var(--dabba-clay-dark)", marginTop: 12 }}>
              Pipeline falhou. Verifique os logs do agent-server.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
