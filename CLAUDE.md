# DABBA Studio — working rules

Tauri desktop app: React GUI + Node/Express `agent-server` sidecar. An RFP goes
in, five chained agent phases run (Discovery → PRD → Architecture → Backlog →
Business Case), one consolidated `report.html` plus a SQLite trace comes out.

## Read these first

| File | What it holds |
|------|---------------|
| [docs/lessons-learned.md](docs/lessons-learned.md) | Why the code is shaped the way it is. Read before changing the renderer, the orchestrator or the personas. |
| [docs/decisions.md](docs/decisions.md) | Chronological record of every defect and its fix, with the measurements. |
| [docs/todo.md](docs/todo.md) | Open decisions and parked ideas. |

## The rule that matters most

**The prompt asks; the code guarantees.**

Every formatting defect in this project was first "fixed" by editing a persona,
and every one of them came back in the next report. Measured: after a global
rule forbidding emoji, a run still emitted 123. After the architect persona was
rewritten to require markdown tables, the next run still emitted six raw HTML
tables.

So: use the persona to make the good outcome likely, and a deterministic guard
in code to make the bad outcome impossible. Anything that reaches
`report.html` needs the second one.

## Before changing the renderer or the quality layer

`agent-server/src/pipeline/markdown.ts` and `quality.ts` look over-engineered
until you know what each branch is defending against. Every one traces to a
defect that shipped. Read `lessons-learned.md` first.

Then:

1. **Run the tests.** `npm test --workspace=agent-server` — 25 regression tests
   over fixtures taken verbatim from real defective artifacts.
2. **Add a test for whatever you fix**, using a real excerpt from a stored run,
   not an invented input. Several of these defects survived one round of fixing
   and returned because the test case was synthetic and the real shape of the
   model's output differed.
3. **Verify against a regenerated report**, not against the diff:
   `npx tsx scripts/regenerate-report.ts <runId>` re-renders a stored run
   without spending tokens.

## Verifying anything

Confirm which binary is answering before trusting a result. A full validation
once came back clean against the *previous* build because the installed app
still held port 8765 — worse than no validation, because it manufactures
confidence.

```bash
lsof -nP -iTCP:8765 -sTCP:LISTEN
```

Compare like with like. A comparison between providers is meaningless if one
side predates a code fix the other benefits from.

## Constraints that are not negotiable

- **Model output is untrusted input.** It originates from an LLM acting on a
  user-uploaded RFP. HTML from it is sanitised by allowlist over already-escaped
  text (see `sanitizeHtmlBlock`), never by blocklist.
- **Narrow transformations, never general ones.** A general `$...$` math rule
  would have deleted `$225,600` from the cost tables. Prefer an explicit list.
- **Never let the model grade its own work.** `*trace` reports
  "Gaps Identified: None" regardless of truth. Checks that matter are computed
  from the artifacts.
- **Secrets stay out of the repo.** Keys live in `agent-server/.env` and
  `~/Library/Application Support/DABBA/.env`, both gitignored. Check
  `git diff --cached` before committing anything touching config.

## Building and packaging

```bash
npm test --workspace=agent-server        # regression suite
npm run build --workspace=agent-server   # typecheck + emit
npm run build:sidecar --prefix agent-server
cd desktop-shell && npx tauri build      # needs Rust; first run of bundle_dmg.sh fails, retry
```

Rebuild the sidecar after touching `agent-server/` — the personas are embedded
in that binary, so persona edits do not reach the packaged app otherwise.

## Language

Repository content — code, comments, docs, personas, report output — is
**English**. Conversation with the user is **Portuguese**.
