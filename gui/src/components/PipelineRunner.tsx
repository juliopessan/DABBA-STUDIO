import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  extractTextFromFile,
  getPipelineStatus,
  pipelineReportUrl,
  startPipeline,
  type PipelineArtifact,
} from "../api";
import { useFileDrop } from "../useFileDrop";
import { openExternal } from "../openExternal";
import ThinkingDots from "./ThinkingDots";
import Button from "./Button";
import PhaseTimeline from "./PhaseTimeline";
import RunningLabel from "./RunningLabel";
import { AlertIcon, ExternalIcon, FileIcon, PlayIcon, UploadIcon } from "./icons";

const TOTAL_PHASES = 5;
const ACCEPTED = ".pdf,.doc,.docx,.html,.htm,.txt,.md";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

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
  const [elapsed, setElapsed] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!runId || status !== "running") return;
    // A one-off network failure (common in the native webview, or a GET
    // landing mid dev-server restart) must not kill polling for the rest of
    // the run — the pipeline keeps going on the backend for minutes; only
    // give up after several consecutive failures.
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 5;

    const interval = setInterval(async () => {
      try {
        const data = await getPipelineStatus(runId);
        consecutiveFailures = 0;
        setArtifacts(data.artifacts);
        if (data.run.status !== "running") {
          setStatus(data.run.status);
          clearInterval(interval);
        }
      } catch (err) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          setError(`Lost connection to the agent-server: ${(err as Error).message}`);
          clearInterval(interval);
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [runId, status]);

  useEffect(() => {
    if (status !== "running") return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  const ingestFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setUploadError(null);
      try {
        const { filename, text } = await extractTextFromFile(file);
        setAttachedFile(filename);
        setRfpText(text);
        setProjectName((p) => p || filename.replace(/\.[^.]+$/, ""));
      } catch (err) {
        setUploadError((err as Error).message);
      } finally {
        setUploading(false);
      }
    },
    []
  );

  const { dragging, dropHandlers } = useFileDrop(ingestFile);

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) ingestFile(file);
  }

  async function handleStart() {
    setError(null);
    setArtifacts([]);
    setElapsed(0);
    try {
      const { runId } = await startPipeline(projectName || "Untitled project", rfpText);
      setRunId(runId);
      setStatus("running");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const busy = status === "running";
  const canStart = rfpText.trim().length > 0 && !busy;
  const progressPct = Math.round((artifacts.length / TOTAL_PHASES) * 100);

  return (
    <motion.section
      // Transform-only entrance: if rAF is suspended (minimised window,
      // backgrounded tab) the animation can freeze midway — with no opacity
      // gate the worst case is a card a few pixels off, never invisible.
      // Fades are reserved for the ephemeral UI below.
      initial={{ y: 16 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      style={{
        position: "relative",
        background: "var(--dabba-surface-muted)",
        borderRadius: "var(--dabba-radius)",
        padding: 32,
        marginBottom: 28,
        overflow: "hidden",
      }}
    >
      {/* Progress bar pinned to the top of the card while a run is active */}
      <AnimatePresence>
        {(busy || status === "done") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "var(--dabba-border)" }}
          >
            <motion.div
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              style={{ height: "100%", background: "var(--dabba-clay)" }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div className="dabba-eyebrow">01 / Full pipeline</div>
          <h2 className="dabba-display" style={{ fontSize: 30, margin: "12px 0 10px" }}>
            The RFP travels the chain.
          </h2>
          <p style={{ color: "var(--dabba-ink-soft)", fontSize: 14, margin: 0, maxWidth: 560, lineHeight: 1.6 }}>
            Attach the RFP and run all 5 phases end to end. Each phase uses the previous
            artifact as its premise; everything is stored in SQLite.
          </p>
        </div>

        <AnimatePresence>
          {busy && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 12px",
                borderRadius: "var(--dabba-radius-sm)",
                background: "var(--dabba-clay)",
                color: "#fff",
                fontFamily: "var(--dabba-font-mono)",
                fontSize: 11.5,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <ThinkingDots color="#fff" size={5} />
              {progressPct}% · {formatElapsed(elapsed)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div style={{ marginTop: 20 }}>
        <input
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Project name"
          disabled={busy}
          style={{
            width: "100%",
            padding: "13px 14px",
            borderRadius: "var(--dabba-radius-sm)",
            border: "1px solid var(--dabba-border)",
            fontSize: 14,
            marginBottom: 10,
            background: "var(--dabba-bg)",
          }}
        />

        {/* Textarea that doubles as a drop target */}
        <div style={{ position: "relative" }} {...dropHandlers}>
          <textarea
            value={rfpText}
            onChange={(e) => setRfpText(e.target.value)}
            rows={5}
            placeholder="Paste the RFP here, or drop a file (PDF, DOCX, HTML, TXT/MD)"
            disabled={busy}
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
                  border: "1.5px dashed var(--dabba-clay)",
                  background: "var(--dabba-clay-tint)",
                  display: "grid",
                  placeItems: "center",
                  gap: 6,
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
                  Drop the file to extract its text
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED}
          onChange={handleFileSelected}
          style={{ display: "none" }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <Button variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={uploading || busy}>
            {uploading ? <ThinkingDots size={5} /> : <UploadIcon />}
            {uploading ? "Reading file…" : "Attach RFP"}
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
                  padding: "6px 11px",
                  borderRadius: "var(--dabba-radius-sm)",
                  background: "var(--dabba-sage-tint)",
                  color: "var(--dabba-sage)",
                  fontFamily: "var(--dabba-font-mono)",
                  fontSize: 11.5,
                }}
              >
                <FileIcon size={13} />
                {attachedFile}
              </motion.span>
            )}
            {uploadError && (
              <motion.span
                key="upload-error"
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
          <Button onClick={handleStart} disabled={!canStart}>
            {busy ? <ThinkingDots color="var(--dabba-bg)" size={5} /> : <PlayIcon />}
            {busy ? <RunningLabel phaseIndex={artifacts.length} /> : "Start pipeline"}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
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
      </AnimatePresence>

      <AnimatePresence>
        {status !== "idle" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                marginTop: 24,
                paddingTop: 20,
                borderTop: "1px solid var(--dabba-border)",
              }}
            >
              <PhaseTimeline artifacts={artifacts} status={status} />

              <AnimatePresence>
                {status === "done" && runId && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 320, damping: 26, delay: 0.2 }}
                    style={{ marginTop: 18 }}
                  >
                    <motion.button
                      onClick={() => openExternal(pipelineReportUrl(runId))}
                      whileHover={{ y: -1.5 }}
                      whileTap={{ scale: 0.97 }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "15px 26px",
                        borderRadius: "var(--dabba-radius-sm)",
                        border: "none",
                        background: "var(--dabba-clay)",
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <ExternalIcon />
                      Open consolidated document
                    </motion.button>
                    <span
                      style={{
                        marginLeft: 12,
                        fontSize: 12.5,
                        color: "var(--dabba-ink-faint)",
                      }}
                    >
                      completed in {formatElapsed(elapsed)}
                    </span>
                  </motion.div>
                )}

                {status === "failed" && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      color: "var(--dabba-clay-dark)",
                      marginTop: 14,
                      fontSize: 13.5,
                    }}
                  >
                    <AlertIcon />
                    Pipeline failed. Check the agent-server logs.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
