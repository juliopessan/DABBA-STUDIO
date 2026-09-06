import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// Mirrors agents/loader.ts exactly, for the same reason: packaged as a Node
// SEA there is no "file next to it" to read from disk — the runtime is
// embedded as a SEA asset (see scripts/build-sidecar.mjs) and read through
// node:sea. In dev / plain tsc it is read straight off disk instead.
//
// Loaded once at server startup (see index.ts, alongside initAgents) and
// cached here so buildConsolidatedReport — called synchronously, including
// from scripts/regenerate-report.ts, which spends no time on an async server
// boot sequence — never touches the filesystem or node:sea per report.
let cached: string | null = null;

async function readFromSeaAssets(): Promise<string> {
  const sea = await import("node:sea");
  return sea.getAsset("mermaid.min.js", "utf8");
}

function readFromDisk(): string {
  // A real npm dependency (see package.json), not a hand-placed file — the
  // version is declared and lockfile-pinned rather than living only as a
  // comment next to a curl command.
  //
  // Resolved via createRequire(process.cwd()) rather than import.meta.url:
  // this file is bundled to CJS for the packaged sidecar (see
  // scripts/build-sidecar.mjs), and esbuild leaves `import.meta` empty in
  // that output format — the exact same constraint documented in
  // agents/loader.ts for the same reason. process.cwd() is agent-server/
  // both in dev (`npm run dev`) and when scripts/regenerate-report.ts is
  // invoked from the repo root (its own cwd handling matches loader.ts).
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const entry = require.resolve("mermaid/dist/mermaid.min.js");
  return readFileSync(entry, "utf-8");
}

export async function loadMermaidRuntime(): Promise<void> {
  const sea = await import("node:sea").catch(() => null);
  cached = sea?.isSea() ? await readFromSeaAssets() : readFromDisk();
}

/**
 * The raw Mermaid UMD bundle source, inlined into every report so a report
 * opened from disk with no network still renders its diagrams — the same
 * reasoning that has the favicon embedded as a data URI rather than linked.
 *
 * Returns "" if called before `loadMermaidRuntime()` resolves, so a startup
 * ordering mistake degrades to diagrams-as-source-text (the previous
 * behaviour) rather than a crash.
 */
export function getMermaidRuntime(): string {
  return cached ?? "";
}
