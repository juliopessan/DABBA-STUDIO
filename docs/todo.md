# TODO — DABBA Studio

Open items and decisions. Format: `[ ]` open · `[x]` done · `[~]` blocked ·
`[>]` delegated · `[-]` dropped (keep the line, add the reason).

Speculation lives here. Once something is proven by a real run it graduates to
[lessons-learned.md](lessons-learned.md); once it is fixed it graduates to
[decisions.md](decisions.md) and gets a test.

---

## Decisions waiting on the owner

- [x] **Render Mermaid diagrams, or keep showing the source?** Decided: render.
      Done — see lessons-learned.md. Correction to the estimate above: the
      only genuinely offline-capable Mermaid build is 3.4MB, not ~1MB;
      reports with diagrams grow to ~3.7MB, not ~1.3MB. Verified against a
      real report (11 diagrams, architecture-beta included): all 11 render
      as actual SVG, zero left as source, zero error fallbacks.
- [ ] **Paid-model tier for client-facing work.** Measured on the same RFP:
      Gemini ran 4.5x faster and produced 3.5x more content than the free
      OpenRouter model, with no formatting defects. The free tier stays useful
      for exploration. Worth making the distinction explicit in the UI so a
      proposal is never generated on the free tier by accident.
- [ ] **Export to .docx / .pptx.** Nobody sends a client an HTML file. Raised
      during the pre-sales brainstorm as probably the highest-leverage
      practical gap.

## Commercial proposal — shipped, next steps

- [x] Rate card in SQLite, seeded with public market benchmarks.
- [x] Deterministic costing from the stored staffing plan.
- [x] Optional terminal `proposal` phase — reads the analysis, never writes to it.
- [ ] **Enter the firm's real rate card.** Until then every total prints as an
      estimate rather than a quote. `PUT /rate-card`.
- [ ] Location mix per role. Today the whole engagement prices at one location;
      a real bid blends onshore, nearshore and offshore, and the blend moves the
      total more than any other single input.
- [ ] Compliance matrix (RFP clause -> where answered). Argued in the brainstorm
      as the higher-value pre-sales artifact and lower hallucination risk than
      the proposal narrative — still not built.
- [ ] Traceability marking inside the proposal: which commitments trace to an
      RFP clause and which are ours. The machinery exists
      (`findOrphanRequirements`), pointed at a different pair of artifacts.

## Product direction (parked, from the brainstorm)

Explored but deliberately not started — recorded so the reasoning is not lost.

- [ ] Separate pre-sales/bid product, sharing the traceability engine with this
      one rather than forking it. The shared requirement IDs across "winning"
      and "executing" artifacts are the differentiator; splitting the data
      throws that away.
- [ ] Wedge candidate: **bid/no-bid qualification + clarification questions**,
      not the compliance matrix. Enters the workflow on day 1-3 rather than
      week 3, has an ROI a partner grasps immediately (a killed pursuit saves
      200-500 hours), and is the lowest-hallucination artifact in the set —
      asking questions and flagging risk is safe; asserting "Comply" is
      contractual.
- [ ] Order any pre-sales roadmap by **hallucination risk**, not perceived
      value: extraction, questions, red flags and credential matching work well
      even on a weak model; proposal prose, effort and pricing do not.

## Known limitations (accepted, not bugs)

- [x] Model invents requirement IDs downstream — happens on both providers.
      Detected deterministically and surfaced in the report; not preventable at
      the prompt layer.
- [x] Persona echo (model returns its instructions instead of the artifact) —
      3 of 8 stored runs. Detected, and the command is retried up to 3 times.
- [ ] `tauri build` fails on its first `bundle_dmg.sh` invocation and succeeds
      on an immediate retry, every time. Cause not investigated; it appears to
      be a stale mounted volume from the previous build. Harmless but noisy.

## Housekeeping

- [ ] `packaging/` and `landing/` have no tests and no CI. The renderer and
      quality layer now do (`npm test --workspace=agent-server`).
- [ ] No CI runs the test suite on push. It is currently only a local gate.
- [ ] The Gemini API key was shared in plaintext during setup and should be
      rotated in Google AI Studio.
