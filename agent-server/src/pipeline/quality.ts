import type { PhaseArtifact } from "../db/sqlite.js";

// A small free model intermittently answers by echoing its own system prompt
// back instead of producing the artifact (measured across stored runs: 3 of 8
// runs, in different phases each time). The damage is not just a wrong-looking
// document — the persona files carry deliberately BAD example requirements to
// teach the model what to avoid ("FR-004: JWT tokens stored in localStorage"),
// and an echoing model lifts those examples into the deliverable as if they
// were the project's real requirements. One run produced a teleconsultation
// PRD whose FR-001..FR-004 were login, logout, password recovery and session
// timeout, none of which appear anywhere in the RFP.
//
// Detection compares the output against the persona's own prose. Template
// lines (tables, fences, headings, bullets) are deliberately excluded as
// signatures: those are exactly what a correct artifact is *supposed* to
// reproduce from the persona, so matching on them would flag good output.
// Narrative instruction lines ("You think like a staff-level product
// manager…") have no business appearing in a deliverable at all.
function signatureLines(persona: string): string[] {
  return persona
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 60 &&
        !/^[|>#\-*\d`]/.test(l) &&
        !l.includes("|") &&
        /[a-z]{4}/.test(l)
    );
}

// Three distinct long prose lines reproduced verbatim is far past coincidence,
// while staying above the noise floor of an artifact that legitimately quotes
// a single instruction back (some personas ask the model to restate the
// command's scope, which can pull one line through).
const ECHO_THRESHOLD = 3;

export function looksLikePersonaEcho(output: string, persona: string): boolean {
  const signatures = signatureLines(persona);
  if (signatures.length < ECHO_THRESHOLD) return false;

  let hits = 0;
  for (const line of signatures) {
    if (output.includes(line)) {
      hits += 1;
      if (hits >= ECHO_THRESHOLD) return true;
    }
  }
  return false;
}

export interface OrphanRequirement {
  id: string;
  phase: string;
}

// The PRD is where requirement IDs are DEFINED; every later phase may only
// cite them. The `*trace` command is supposed to enforce that, but it is the
// same model auditing its own work and it reports success regardless — one run
// stated "Gaps Identified: None" while the backlog cited FR-005 and FR-007,
// which the PRD never defined, complete with invented descriptions ("pharmacy
// payment gateway", absent from the RFP). A cited-but-undefined ID is the
// single highest-signal traceability defect available without judging content,
// and unlike the model's self-audit this cannot report a false pass.
const REQUIREMENT_ID = /\b(?:FR|NFR)-\d+/g;

// An ID counts as defined when the PRD introduces it as a subject — as a
// heading, a table row, or a bolded/plain label followed by punctuation —
// rather than merely mentioning it in passing prose.
function definedIds(prdOutput: string): Set<string> {
  const defined = new Set<string>();
  for (const rawLine of prdOutput.split("\n")) {
    const line = rawLine.trim();
    const patterns = [
      /^#{1,6}\s+\**((?:FR|NFR)-\d+)\**\s*[:.\-—]/, // ### FR-001: Title
      /^\|\s*\**((?:FR|NFR)-\d+)\**\s*\|/, // | **FR-001** | ...
      /^>?\s*\**((?:FR|NFR)-\d+)\**\s*[:.\-—]/, // FR-001: text  /  > **FR-001** — text
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(line);
      if (match) defined.add(match[1]);
    }
  }
  return defined;
}

export function findOrphanRequirements(artifacts: PhaseArtifact[]): OrphanRequirement[] {
  const prd = artifacts.find((a) => a.phase === "prd");
  if (!prd) return [];

  const defined = definedIds(prd.output);
  // Nothing recognisable was defined — the PRD is malformed (often the echo
  // case above). Reporting every downstream ID as orphaned would be noise on
  // top of a failure already reported, so stay quiet and let the echo warning
  // carry it.
  if (defined.size === 0) return [];

  const orphans: OrphanRequirement[] = [];
  const seen = new Set<string>();
  for (const artifact of artifacts) {
    if (artifact.phase === "prd" || artifact.phase === "discovery") continue;
    for (const id of artifact.output.match(REQUIREMENT_ID) ?? []) {
      const key = `${artifact.phase}:${id}`;
      if (defined.has(id) || seen.has(key)) continue;
      seen.add(key);
      orphans.push({ id, phase: artifact.phase });
    }
  }
  return orphans;
}
