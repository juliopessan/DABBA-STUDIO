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
