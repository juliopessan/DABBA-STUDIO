import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { looksLikePersonaEcho, findOrphanRequirements } from "../src/pipeline/quality.js";
import type { PhaseArtifact } from "../src/db/sqlite.js";

const PERSONAS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "personas");
const persona = (name: string) => readFileSync(path.join(PERSONAS, `${name}.md`), "utf-8");

function artifact(phase: string, output: string): PhaseArtifact {
  return {
    id: `${phase}-id`,
    run_id: "run",
    phase,
    agent_id: phase,
    command: "*generate",
    output,
    provider: "test",
    model: "test",
    created_at: new Date().toISOString(),
  };
}

describe("persona echo detection", () => {
  test("flags a response that returns the persona instead of the artifact", () => {
    // Measured in 3 of 8 stored runs. The damage is not merely a wrong-looking
    // document: the persona files carry deliberately BAD example requirements
    // to teach the model what to avoid, and an echoing model lifts those into
    // the deliverable. One teleconsultation PRD came back with FR-001..FR-004
    // about login, logout, password recovery and session timeout.
    const prd = persona("prd");
    assert.equal(looksLikePersonaEcho(prd, prd), true);
    assert.equal(looksLikePersonaEcho(prd.slice(0, 6000), prd), true, "a partial echo still counts");
  });

  test("does not flag a real artifact, even one quoting a single instruction", () => {
    const prd = persona("prd");
    const realish = [
      "# Product Requirements Document",
      "## 1. Overview",
      "The platform centralises document intake for the client's finance team.",
      "## 5. Functional Requirements",
      "### FR-001: Document ingestion",
      "Given a document uploaded via API, when processed, then it is stored with metadata.",
    ].join("\n\n");
    assert.equal(looksLikePersonaEcho(realish, prd), false);
  });

  test("a heading naming the agent is not an echo", () => {
    // Two stored runs opened with "# @architect — Tony" or "@business-case —
    // Pepper" and were otherwise entirely genuine. Cosmetic noise, not a loss.
    const architect = persona("architect");
    const output = "# @architect — Tony: Phase E\n\n## E.4 Team Composition\n\nThe team is sized for a modular monolith.";
    assert.equal(looksLikePersonaEcho(output, architect), false);
  });
});

describe("traceability", () => {
  test("flags requirement IDs cited downstream but never defined in the PRD", () => {
    // The *trace command asks the model to audit its own traceability and
    // reported "Gaps Identified: None" while the backlog cited FR-005 and
    // FR-007, describing them with invented detail. This check is computed
    // from the artifacts, so it cannot report a false pass.
    const artifacts = [
      artifact("prd", "### FR-001: Ingestion\ntext\n### FR-002: Search\ntext\n| **NFR-001** | Security |"),
      artifact("backlog", "Story A traces to FR-001. Story B traces to FR-013 and NFR-009."),
    ];
    const orphans = findOrphanRequirements(artifacts);
    assert.deepEqual(orphans.map((o) => o.id).sort(), ["FR-013", "NFR-009"]);
    assert.equal(orphans.every((o) => o.phase === "backlog"), true);
  });

  test("stays silent when every citation resolves", () => {
    const artifacts = [
      artifact("prd", "### FR-001: Ingestion\n### FR-002: Search"),
      artifact("backlog", "Story A traces to FR-001, Story B to FR-002."),
    ];
    assert.deepEqual(findOrphanRequirements(artifacts), []);
  });

  test("recognises IDs defined as headings, table rows or labelled lines", () => {
    const artifacts = [
      artifact("prd", ["## FR-001: Heading form", "| **FR-002** | Table row form |", "FR-003: Labelled form"].join("\n")),
      artifact("backlog", "Covers FR-001, FR-002, FR-003."),
    ];
    assert.deepEqual(findOrphanRequirements(artifacts), []);
  });

  test("says nothing when the PRD itself is malformed", () => {
    // Reporting every downstream ID as orphaned would be noise piled on a
    // failure the echo check already reports.
    const artifacts = [artifact("prd", "prose with no requirement ids at all"), artifact("backlog", "Covers FR-001.")];
    assert.deepEqual(findOrphanRequirements(artifacts), []);
  });
});

describe("report shell", () => {
  test("carries an embedded favicon and requests nothing external for it", async () => {
    // The report is handed to a client as one self-contained file, often
    // opened from disk with no network — a linked icon would just be missing.
    const { buildConsolidatedReport } = await import("../src/pipeline/htmlReport.js");
    const run = {
      id: "run-1",
      project_name: "Test",
      status: "done" as const,
      created_at: new Date().toISOString(),
      report_path: null,
    };
    const html = buildConsolidatedReport(run, [artifact("discovery", "# Report\n\ntext")]);
    const icons = [...html.matchAll(/<link rel="icon"[^>]*>/g)].map((m) => m[0]);
    const hrefOf = (tag: string) => tag.match(/href="([^"]*)"/)?.[1] ?? "";

    // Both forms must ship. Chrome does not render an SVG favicon delivered
    // through a data: URI, so the SVG alone left the tab blank; the PNG is the
    // one that actually appears there.
    const svg = icons.find((i) => i.includes('type="image/svg+xml"'));
    const png = icons.find((i) => i.includes('type="image/png"'));
    assert.ok(svg, "the vector form must be declared");
    assert.ok(png, "the raster fallback must be declared — an SVG data URI alone does not render in Chrome");

    // The href scheme is what decides whether anything is fetched. Testing for
    // the absence of "http" anywhere would fail on the SVG's own XML
    // namespace, which no browser ever requests.
    assert.ok(hrefOf(svg!).startsWith("data:image/svg+xml,"), "inlined, not linked");
    assert.ok(decodeURIComponent(hrefOf(svg!)).includes("<svg"), "and a decodable svg");

    const base64 = hrefOf(png!).replace("data:image/png;base64,", "");
    const bytes = Buffer.from(base64, "base64");
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "a real PNG signature");
  });
});
