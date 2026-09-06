# Lessons Learned — DABBA Studio

Accumulated engineering lessons. Each entry exists because something actually
broke in a delivered report, not because it seemed like a good idea.

**Rules**
1. Never delete a lesson. Mark it `[OBSOLETE]` with the reason if it stops
   applying — the reasoning is the value, and a deleted lesson gets rediscovered
   the expensive way.
2. Add a lesson only when a real defect or a real measurement produced it.
   Speculation belongs in [todo.md](todo.md).
3. Every lesson names the evidence: the run, the artifact, the number.
4. When a lesson leads to a code fix, it also leads to a test in
   `agent-server/tests/`. A lesson without a test is a lesson that will be
   relearned.

---

## [ARCHITECTURE] The prompt asks; the code guarantees

**Evidence:** every formatting defect fixed so far. Emoji: after adding a
global `FORMATTING_RULE` forbidding them, a validation run still emitted 123.
Section duplication: after fixing a contradiction in the persona *and*
rewriting the output template, a targeted single-command test showed the model
still emitting the sections it had just been told not to. HTML tables: after
the architect persona was rewritten to require markdown tables, the next run
still produced six raw `<table>` blocks.

**Lesson:** a prompt rule reduces the frequency of a defect; it never removes
it. Any defect that would reach the client must have a deterministic guard in
code. Use the prompt to make the good outcome likely and the code to make the
bad outcome impossible.

**Applies to:** anything that renders into `report.html`.

---

## [ARCHITECTURE] Verifying is cheaper and safer than generating

**Evidence:** the `*trace` command asks the model to audit its own
traceability. It reported `Gaps Identified: None` while the backlog cited
FR-005 and FR-007, which the PRD never defined, and described them with
invented detail ("pharmacy payment gateway", absent from the RFP).
`findOrphanRequirements` — a few dozen lines comparing IDs across artifacts —
caught what the model's self-audit declared clean.

**Lesson:** never let the model grade its own work on anything that matters. A
self-audit reports success regardless. Checks computed from the artifacts
cannot return a false pass.

---

## [MODEL] A better model does not fix traceability

**Evidence:** same RFP, both providers, all code fixes applied to both.
`nvidia/nemotron-nano-9b` produced 0 orphan requirement IDs; `gemini-3.7-flash`
produced 3 — it invented FR-013, FR-014 and FR-015 with complete, plausible
descriptions when the PRD stopped at FR-012.

**Lesson:** upgrading the model buys volume, speed and formatting discipline.
It does not buy grounding, and may worsen it, because a stronger model writes
more and more confidently. The verification layer is not a workaround for
cheap models; it is permanent.

---

## [PIPELINE] Context budget, and the RFP as the anchor

**Evidence:** an AI-governance RFP produced discovery (5k chars) → PRD (9k) →
architecture (29k), all on topic. The backlog — the first phase handed a 29k
input — produced user stories about booking clinic appointments, and the
business case costed the invention. Two of five chapters described a product
nobody had asked for.

**Lesson:** a small model does not fail loudly when its context is overrun; it
quietly writes a generic project. Two consequences, both now in
`orchestrator.ts`:
- The source RFP anchors **every** phase, not just discovery. It is the only
  statement of what the project is; without it, a phase whose input drifted has
  nothing to recover from and nothing downstream can detect the drift.
- Carried context is bounded, dropping fenced blocks first — Mermaid diagrams
  are roughly half of a typical architecture document and the least useful part
  of it to a backlog or business-case agent.

---

## [PIPELINE] Chained commands must have disjoint scope

**Evidence:** the backlog phase produced two "Effort Estimation" sections
quoting 84 and 107 total points, and three different "Staffing Plans". Causes,
in order of discovery: a direct contradiction inside `backlog.md` (one line
said `*breakdown` must not emit those sections, another said it must); an
output template that showed the whole consolidated document in one block; and
finally the model ignoring both corrections anyway.

**Lesson:** only chain a command whose scope is genuinely disjoint from what an
earlier command in the same phase produces. Then de-duplicate in code anyway
(`dedupeRepeatedSections`), keeping the **last** occurrence — that is the
output of the command that owns the section. Contradictory numbers under the
same heading are worse than a missing section: the reader cannot tell which is
authoritative.

---

## [PIPELINE] Run the command the persona actually documents

**Evidence:** `PIPELINE_STEPS` called discovery's `*start`, which begins a
guided interview. In an automated pipeline there is no human to interview, so
the artifact was a list of questions with no answers — zero requirements
captured — and every later phase inherited that empty premise.

**Lesson:** a command that is correct interactively can be useless
non-interactively. Check what a command actually produces under `autoMode`
before wiring it into the pipeline.

---

## [RENDERING] Fence pairing follows CommonMark, and unpaired fences are damage

**Evidence:** a closing fence carries no info string, so a ` ```mermaid ` line
met while a block is already open is content, not a closer. Treating every
` ``` ` as a toggle silently reshuffled which spans of the document were code:
the backlog phase rendered 4 real headings instead of 26. Separately, a phase
that ended with a stray ` ``` ` opening nothing became an *opener* once the
next command's text was concatenated after it, swallowing that command's first
heading into a nearly empty box.

**Lesson:** pair fences properly, drop unpaired **bare** markers, and keep
unpaired `mermaid` openers (the diagram after them is real content — close them
at render time instead).

---

## [RENDERING] Implicit close signals for fences the model never closed

**Evidence:** a single unclosed ` ```mermaid ` in the backlog swallowed the
Effort Estimation, Staffing Plan and Sprint 1 tables — 6,819 characters — as
literal text.

**Lesson:** three line shapes are safe implicit terminators because none is
valid Mermaid: a bare `---` divider, an opening HTML block tag, and a markdown
heading of two or more hashes. One hash is *not* safe — `# comment` is ordinary
content in many languages.

---

## [RENDERING] Model drawings arrive in three dialects, usually unfenced

**Evidence:** one report contained 14 unfenced drawings. Unicode boxes
(`┌ ├ └ │`), ASCII boxes (`+---+` with `|` sides), and vertical flows with
bracketed labels joined by connectors. Left as prose, the paragraph builder
joins the lines with spaces and the drawing becomes one unreadable run. An
early fix caught only the connectors of the third dialect and emitted a
one-character `<pre>` for each — five fragments in a single report.

**Lesson:** treat a line as preformatted when it starts with a drawing
character, or when the following line is connector-only. Crucially, a `|` line
may only **continue** a drawing, never begin one — that is what keeps GFM
tables, whose rows also start with `|`, out of this path.

---

## [RENDERING] Sanitise untrusted HTML by allowlist over already-escaped text

**Evidence:** the model emits raw `<table>` markup regardless of instructions,
and escaping it delivered angle-bracket source to the reader.

**Lesson:** the content comes from an LLM acting on an uploaded RFP, so it is
untrusted. Escape the whole block **first**, then re-enable only an allowlist
of tags on the now-inert text. Anything unanticipated — `script`, `iframe`,
`on*` handlers, `javascript:` URLs — stays escaped, rather than depending on a
blocklist having predicted it. Verified with six attack shapes in
`tests/markdown.test.ts`.

---

## [RENDERING] Narrow transformations, never general ones

**Evidence:** LaTeX leaked into reports as `$\rightarrow$`. The tempting fix —
treat `$...$` as math — would have matched `$225,600 ... $120/hour` in the cost
tables and deleted the numbers. A named-command map was used instead.

Same shape, different case: the first emoji strip collapsed runs of spaces
document-wide to tidy up after the removed character, which flattened the
indentation inside every Mermaid block.

**Lesson:** when a transformation could plausibly match real content, narrow it
until it cannot. Prefer an explicit list over a general pattern.

---

## [PROCESS] Validate against the artifact, not against the impression

**Evidence:** a full end-to-end validation was run and reported clean — against
the *old* build, because the port was still held by the previously installed
app rather than the freshly built server. Separately, a comparison of free
model vs Gemini initially credited Gemini with fixing domain drift; the fair
comparison, using a run made after the RFP-anchor fix, showed both at zero. The
code fix had done it.

**Lesson:** confirm which binary is answering before trusting a result, and
compare like with like. A validation run against the wrong build is worse than
no validation, because it manufactures confidence.

---

## [PROPOSAL] A commercial proposal is assembled, not generated

**Evidence:** the same defect that produces an invented requirement ID produces
an invented price, and the consequence is not the same. Measured on this
pipeline, `gemini-3.7-flash` invented FR-013, FR-014 and FR-015 with complete,
plausible descriptions when the PRD stopped at FR-012. In a PRD that is a
traceability gap; in a proposal it is a commitment somebody signs.

**Lesson:** most of a proposal already exists in the artifacts — scope from the
PRD, approach from the architecture, team and duration from the staffing plan.
Split the work by who can be trusted with it:

- **Code assembles** everything numeric. Team, hours and cost are arithmetic
  over the stored staffing plan and the rate card (`pricing.ts`,
  `proposal.ts`), inserted after the model has written.
- **The model writes** only connective narrative, and its persona forbids
  emitting any figure at all — no currency, no headcount, no percentage. If a
  sentence needs a number, it names the section instead.

Verified on a real run: the narrative contained zero monetary values and zero
percentages, while the generated tables carried the full costing.

---

## [PROPOSAL] Missing input, not model weakness

**Evidence:** pricing needs a rate card, pyramid ratios and location mix. None
of it appears in an RFP or in any earlier phase, and all of it is
firm-confidential. A model asked to price has nothing to reason from.

**Lesson:** this is an input problem and must be solved as one. The rate card
lives in SQLite (`rate_card`), seeded once with public market benchmarks and
stamped `market-benchmark`; a hand-entered rate is stamped `firm-actual`. The
proposal reads that stamp and, while any rate is still a benchmark, prints
"This total is an estimate, not a quote" above the total.

A missing rate produces a stated gap, never a zero — summing an absent rate as
zero understates an engagement with nothing on the page saying so.

---

## [PROPOSAL] Inference must be visible, not buried

**Evidence:** role titles in the staffing plan name skills ("AI QA & Evaluation
Specialist"), never grades. Mapping title to grade is therefore inference, and
it is the assumption most likely to be wrong. An early version mapped "Lead" to
Senior Manager, which put a single line at $358k on a real run — an error that
survives review precisely because the total still looks plausible.

**Lesson:** print the inference next to the number. The Team and Effort table
carries a Grade column and tells the reader to check it, because a consultant
can correct it in seconds and nobody can correct what they cannot see. "Lead"
now maps to Manager, a hands-on delivery grade; "Architect" keeps the higher
one.

---

## [RENDERING] Mermaid diagrams are rendered client-side, inlined for offline use

**Evidence:** a real report from an architecture-heavy run carried 11 Mermaid
blocks (`architecture-beta`, `sequenceDiagram`, `erDiagram`, `gantt`,
`mindmap`, `flowchart`), all shown as literal source text — reasonable for a
plain-markdown viewer, odd for a client deliverable. The user reported this
directly as a rendering defect.

**Lesson:** offline capability is a real constraint, not a nice-to-have — the
report is opened from disk with no server and no network often enough that
this project already embeds its favicon as a data URI for exactly that
reason. A `<script src="https://cdn...">` for Mermaid would leave every
diagram blank the moment that assumption holds, so the whole runtime is
inlined instead (`mermaidRuntime.ts`, embedded as a SEA asset the same way
personas are). There is no smaller self-contained option: Mermaid's own
"slim" ESM build is a ~30KB loader that fetches diagram-type chunks over the
network on demand, which fails the identical requirement a CDN link would.

**Correction to an earlier estimate:** this same file previously guessed
"~1MB, reports grow to ~1.3MB" before the actual bundle was measured. The real
number is 3.4MB (verified via `data.jsdelivr.com`'s file listing across every
`/dist/*.js` build Mermaid ships) — reports with diagrams grow to ~3.7MB, not
~1.3MB. Measure before writing the number down a second time.

**A second, easy-to-miss requirement:** the diagrams in this report use
`architecture-beta`, a diagram type Mermaid only added in v11.1. Pinning an
old "safe" major version would have silently failed on exactly the diagrams
this project's own architect persona is instructed to produce. Confirmed
11.17.2 (current stable) before pinning it.

**Verified against the real report, not just the unit tests:** the markdown
parser's fence-tagging is covered by `tests/markdown.test.ts` (a `mermaid`
fence gets `<pre class="mermaid">`; everything else keeps the plain code box
— see the "code blocks" suite). Actual browser rendering is not something a
Node test can check, so it was verified separately in a live tab: 11/11
diagrams produced a real SVG (correct `viewBox`, `role="graphics-document"`,
matching node labels), zero fell back to Mermaid's own error rendering.

**Security note:** `securityLevel: "strict"` in the Mermaid init call. The
diagram source is model output acting on an untrusted RFP — the same reason
raw HTML from the model is sanitised by allowlist elsewhere in this pipeline
— so Mermaid's own HTML-in-label sanitisation stays on rather than being
relaxed for convenience.

## [RENDERING] Rendering Mermaid exposed two defects the source text had hidden

**Evidence:** once diagrams actually rendered, a later run (`903e8ed5`, 14
diagrams) surfaced two failures that had been invisible while every diagram
was shown as source text. Both reached a delivered report:

1. Two diagrams printed Mermaid's own error graphic — a red bomb icon reading
   *"Syntax error in text / mermaid version 11.17.2"* — where the picture
   belonged. Cause: the model wrote `A[Label] :::className` with a space.
   Mermaid requires them touching; the space is a hard parse error. Both
   diagrams parse with the space removed, verified in the browser.
2. All three `architecture-beta` diagrams rendered a literal `?` glyph on
   every node — 48 of them — because the architect persona documented a
   catalogue of Iconify names (`azure:sql-database`, `mdi:web`). Those resolve
   only by fetching an icon pack at view time, which is the exact assumption
   this report is built to avoid. Worse, `azure:` is not a real Iconify prefix
   at all, so those could never have resolved by any means. Mermaid ships
   exactly five icons that work with no registration — `cloud`, `database`,
   `disk`, `internet`, `server` — confirmed by probing each one in a live tab
   rather than trusting the docs.

**Lesson:** making output visible is what makes its defects reviewable. Both
of these had been shipping for as long as the diagrams had, and neither was
detectable while the reader saw source text — the "?" glyphs did not exist yet
and the parse error had nothing to parse. Expect a rendering change to
generate a second round of defects rather than to close the topic.

**Second lesson, the project's own rule applied twice:** the prompt asks; the
code guarantees. The architect persona now documents only the five icons that
exist and the no-space `:::` rule, *and* `repairMermaidLine` enforces both
deterministically — a persona edit alone has never held in this project. Both
repairs are narrow on purpose: the icon rewrite fires only on `service`/`group`
lines (keywords unique to `architecture-beta`), so a flowchart node labelled
`A(Step 1: capture the document)` is untouched. Regression tests use the
verbatim excerpts from run `903e8ed5`.

**A defect the reader should never see raw:** the failure path itself was also
wrong. Mermaid's default behaviour is to inject its own error graphic into the
page, which is how a bomb icon and a version string ended up inside a document
addressed to a client. `suppressErrorRendering: true` plus per-diagram
`mermaid.render()` calls hand the failure back to us, and an unparseable
diagram now degrades to a quiet one-line note above its own source — the same
"degrade to source text" behaviour already used when the runtime is missing.
