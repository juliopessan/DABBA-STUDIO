import type { PipelineRun, PhaseArtifact } from "../db/sqlite.js";
import { markdownToHtml } from "./markdown.js";

const PHASE_LABELS: Record<string, string> = {
  discovery: "Discovery",
  prd: "PRD",
  architecture: "Architecture",
  backlog: "Backlog",
  "business-case": "Business Case",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildConsolidatedReport(run: PipelineRun, artifacts: PhaseArtifact[]): string {
  const generatedAt = new Date().toLocaleString("pt-BR");

  const toc = artifacts
    .map((a, i) => `<li><a href="#fase-${i}">${PHASE_LABELS[a.phase] ?? a.phase}</a></li>`)
    .join("\n");

  const sections = artifacts
    .map(
      (a, i) => `
    <section class="phase" id="fase-${i}">
      <div class="phase-header">
        <span class="phase-index">${String(i + 1).padStart(2, "0")}</span>
        <div>
          <h2>${PHASE_LABELS[a.phase] ?? a.phase}</h2>
          <p class="phase-meta">@${a.agent_id} · ${escapeHtml(a.command)} · ${a.provider ?? "?"} · ${a.model ?? "?"}</p>
        </div>
      </div>
      <div class="phase-content">
        ${markdownToHtml(a.output)}
      </div>
    </section>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>DABBA Studio — ${escapeHtml(run.project_name)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
@import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600;700&display=swap");

:root {
  --bg: #f5f4ed;
  --surface: #ffffff;
  --border: #e3e1d7;
  --ink: #1f1e1d;
  --ink-soft: #6b6a63;
  --clay: #d97757;
  --clay-tint: #fbeae2;
  --sage: #7a8b6f;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: "Inter", -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 860px; margin: 0 auto; padding: 56px 24px 96px; }
header h1 {
  font-family: "Fraunces", Georgia, serif;
  font-size: 40px;
  margin: 0 0 4px;
}
header h1 span { color: var(--clay); }
header p.subtitle { color: var(--ink-soft); margin: 0 0 4px; }
header p.timestamp { color: var(--ink-soft); font-size: 13px; margin: 0 0 32px; }

nav.toc {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px 24px;
  margin-bottom: 40px;
  box-shadow: 0 1px 2px rgba(31,30,29,.04), 0 8px 24px rgba(31,30,29,.06);
}
nav.toc h3 { font-family: "Fraunces", serif; margin: 0 0 10px; font-size: 16px; }
nav.toc ul { margin: 0; padding-left: 20px; }
nav.toc a { color: var(--clay); text-decoration: none; }
nav.toc a:hover { text-decoration: underline; }

section.phase {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 32px;
  margin-bottom: 24px;
  box-shadow: 0 1px 2px rgba(31,30,29,.04), 0 8px 24px rgba(31,30,29,.06);
  scroll-margin-top: 24px;
}
.phase-header { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 20px; }
.phase-index {
  font-family: "Fraunces", serif;
  font-size: 28px;
  color: var(--clay);
  min-width: 44px;
}
.phase-header h2 { font-family: "Fraunces", serif; margin: 0; font-size: 24px; }
.phase-meta { color: var(--ink-soft); font-size: 12px; margin: 4px 0 0; }

.phase-content h2 { font-size: 19px; margin-top: 28px; }
.phase-content h3 { font-size: 16px; margin-top: 22px; }
.phase-content h4 { font-size: 14px; margin-top: 18px; }
.phase-content p { line-height: 1.7; }
.phase-content ul, .phase-content ol { line-height: 1.7; padding-left: 22px; }
.phase-content ul ul, .phase-content ol ol, .phase-content ul ol, .phase-content ol ul { margin-top: 4px; }
.phase-content .table-wrap { overflow-x: auto; margin: 16px 0; }
.phase-content table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.phase-content th, .phase-content td {
  border: 1px solid var(--border);
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}
.phase-content th { background: var(--bg); font-family: "Fraunces", serif; }
.phase-content hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
.phase-content pre {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  overflow-x: auto;
  font-size: 13px;
}
.phase-content code { font-family: ui-monospace, monospace; font-size: 0.92em; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>DABBA <span>Studio</span></h1>
      <p class="subtitle">${escapeHtml(run.project_name)} — documento consolidado do pipeline</p>
      <p class="timestamp">Gerado em ${generatedAt} · run ${run.id}</p>
    </header>

    <nav class="toc">
      <h3>Fases</h3>
      <ul>${toc}</ul>
    </nav>

    ${sections}
  </div>
</body>
</html>`;
}
