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
  const generatedAt = new Date().toLocaleString("en-US");

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
<html lang="en">
<head>
<meta charset="utf-8" />
<title>DABBA Studio — ${escapeHtml(run.project_name)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
@import url("https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&display=swap");

:root {
  --bg: #f2efe8;
  --surface: #e5e1d8;
  --border: #d3cfc5;
  --ink: #11110f;
  --ink-soft: #5c5952;
  --clay: #ed6738;
  --clay-tint: #f7ddd1;
  --sage: #5c8a5e;
  --display: "Helvetica Neue", "Inter Tight", Helvetica, Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: "Inter Tight", "Helvetica Neue", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 860px; margin: 0 auto; padding: 56px 24px 96px; }
header h1 {
  font-family: var(--display);
  font-weight: 700;
  letter-spacing: -0.035em;
  font-size: 44px;
  margin: 0 0 8px;
}
header h1 span { color: var(--clay); }
header p.subtitle { color: var(--ink-soft); margin: 0 0 4px; }
header p.timestamp { color: var(--ink-soft); font-size: 13px; margin: 0 0 32px; }

nav.toc {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 20px 24px;
  margin-bottom: 40px;
}
nav.toc h3 { font-family: var(--mono); text-transform: uppercase; letter-spacing: .16em; margin: 0 0 10px; font-size: 11px; color: var(--ink-soft); }
nav.toc ul { margin: 0; padding-left: 20px; }
nav.toc a { color: var(--clay); text-decoration: none; }
nav.toc a:hover { text-decoration: underline; }

section.phase {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 32px;
  margin-bottom: 24px;
  scroll-margin-top: 24px;
}
.phase-header { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 20px; }
.phase-index {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .12em;
  color: var(--clay);
  min-width: 44px;
  padding-top: 6px;
}
.phase-header h2 { font-family: var(--display); font-weight: 700; letter-spacing: -0.03em; margin: 0; font-size: 26px; }
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
.phase-content th { background: var(--bg); font-weight: 600; }
.phase-content hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
.phase-content pre {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 2px;
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
      <p class="subtitle">${escapeHtml(run.project_name)} — consolidated pipeline document</p>
      <p class="timestamp">Generated ${generatedAt} · run ${run.id}</p>
    </header>

    <nav class="toc">
      <h3>Phases</h3>
      <ul>${toc}</ul>
    </nav>

    ${sections}
  </div>
</body>
</html>`;
}
