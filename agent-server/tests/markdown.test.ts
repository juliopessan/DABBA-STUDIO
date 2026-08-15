import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markdownToHtml, unwrapOuterCodeFence } from "../src/pipeline/markdown.js";

// Every case below is a defect that actually reached a delivered report, and
// the fixtures are verbatim excerpts of the artifacts that produced them —
// not invented inputs. A synthetic test would pass while the real shape of
// the model's output still broke, which is exactly how several of these
// survived one round of fixing and came back in the next report.
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name: string) => readFileSync(path.join(FIXTURES, name), "utf-8");

function preBlocks(html: string): string[] {
  return [...html.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)].map((m) => m[1]);
}

describe("code blocks", () => {
  test("does not double-space the inside of a fenced block", () => {
    // Each line used to be pushed with a trailing "\n" and then joined with
    // "\n" again, putting a blank line between every row of every diagram in
    // every report ever produced.
    const html = markdownToHtml("```mermaid\nflowchart TD\n  A --> B\n  B --> C\n```");
    const body = preBlocks(html)[0];
    assert.equal(body.split("\n").filter((l) => l.trim() === "").length, 2, "only the leading/trailing newline");
    assert.match(body, /flowchart TD\n {2}A --&gt; B\n {2}B --&gt; C/);
  });

  test("keeps a genuine mermaid diagram as a code block", () => {
    const html = markdownToHtml("```mermaid\nerDiagram\n  USER ||--o{ ORDER : places\n```");
    assert.equal(preBlocks(html).length, 1);
    assert.equal(html.includes("<table"), false);
  });
});

describe("fences the model got wrong", () => {
  test("an unclosed mermaid fence does not swallow the tables after it", () => {
    // The backlog phase opened ```mermaid for a dependency graph and never
    // closed it; Effort Estimation, Staffing Plan and Sprint 1 all rendered
    // as literal text inside the diagram box.
    const html = markdownToHtml(fixture("unclosed-mermaid-swallows-tables.md"));
    assert.ok(html.includes("<table"), "the Effort Estimation table must render as a table");
    // Heading levels are shifted down by one (h1 is reserved for the phase
    // title), so assert on the text rather than a specific level.
    assert.ok(/<h[1-6]>[^<]*Effort Estimation/i.test(html), "and its heading as a heading");
  });

  test("a stray unpaired bare fence does not trap the next heading", () => {
    // *phase-e ended with a ``` that opened nothing. Concatenated with
    // *review, it became an opener and swallowed the heading that followed
    // into a nearly empty code box.
    const html = markdownToHtml(fixture("stray-bare-fence.md"));
    assert.ok(/<h[1-6]>[^<]*Review of/i.test(html), "the review heading must be a heading");
    const trapped = preBlocks(html).filter((b) => /#\s|Review of/i.test(b));
    assert.equal(trapped.length, 0, "nothing containing a heading may remain inside a <pre>");
  });

  test("a ```mermaid block whose body is a table becomes a real table", () => {
    const html = markdownToHtml(fixture("mislabeled-mermaid-table.md"));
    assert.ok(html.includes("<table"), "pipe rows must become a table, not literal text");
  });

  test("unwrapping leaves mermaid alone but removes every other wrapper", () => {
    assert.match(unwrapOuterCodeFence("```mermaid\ngraph TD\n```"), /```mermaid/);
    assert.doesNotMatch(unwrapOuterCodeFence("```markdown\n# Title\n```"), /```/);
    assert.doesNotMatch(unwrapOuterCodeFence("```\n# Title\n```"), /```/);
    // Hallucinated closing tags used as fence info strings.
    assert.doesNotMatch(unwrapOuterCodeFence("prose\n```<next_steps>\nmore prose"), /```/);
  });
});

describe("drawings the model did not fence", () => {
  test("a unicode box keeps its lines instead of collapsing into a paragraph", () => {
    const html = markdownToHtml(fixture("ascii-box-unfenced.md"));
    const box = preBlocks(html).find((b) => b.includes("ARCHITECTURE SCOPE"));
    assert.ok(box, "the box must be preformatted");
    assert.ok(box!.split("\n").length > 8, "and keep every row");
    assert.equal(/<p>[^<]*[┌│└]/.test(html), false, "no box may be flattened into prose");
  });

  test("a vertical [node] │ ▼ flow stays one block, not one <pre> per arrow", () => {
    // These node labels start with "[", so matching on drawing characters
    // alone caught only the lone connectors and emitted a one-character <pre>
    // for each — five of them in a single report.
    const html = markdownToHtml(fixture("ascii-vertical-flow.md"));
    const blocks = preBlocks(html);
    assert.equal(blocks.filter((b) => b.trim().length < 40).length, 0, "no fragment blocks");
    const flow = blocks.find((b) => b.includes("Document Ingestion"));
    assert.ok(flow, "the flow must be preformatted");
    assert.ok(flow!.includes("▼"), "with its arrows in the same block as its labels");
  });

  test("an ASCII +---+ box is treated the same as a unicode one", () => {
    const html = markdownToHtml("+------------+\n| STEP ONE   |\n| STEP TWO   |\n+------------+");
    assert.equal(preBlocks(html).length, 1);
  });

  test("a markdown table is never mistaken for a drawing", () => {
    // Table rows start with "|" too — the guard is that a "|" line may only
    // continue a drawing, never begin one.
    const html = markdownToHtml("| Role | Cost |\n|------|-----:|\n| Dev | 100 |");
    assert.ok(html.includes("<table"));
    assert.equal(preBlocks(html).length, 0);
  });

  test("a horizontal rule is not swallowed as a drawing", () => {
    const html = markdownToHtml("before\n\n---\n\nafter");
    assert.ok(html.includes("<hr>"));
    assert.equal(preBlocks(html).length, 0);
  });
});

describe("raw HTML from the model", () => {
  test("a <table> renders as a table rather than escaped source", () => {
    const html = markdownToHtml(fixture("raw-html-table.md"));
    assert.ok(html.includes("<table"), "must render");
    assert.equal(html.includes("&lt;table&gt;"), false, "must not be escaped into view");
  });

  test("script, iframe, img and event handlers stay inert", () => {
    // The content comes from an LLM acting on an uploaded RFP, so it is
    // untrusted: the sanitiser escapes the block first and re-enables only an
    // allowlist, meaning anything unanticipated stays escaped.
    const attacks = [
      "<table><tr><td><script>alert(1)</script>x</td></tr></table>",
      '<table><tr><td onmouseover="steal()">x</td></tr></table>',
      '<table><tr><td><img src=x onerror=alert(1)><iframe src="javascript:alert(1)"></iframe></td></tr></table>',
      '<table><tr><td><a href="javascript:alert(1)">click</a></td></tr></table>',
    ];
    for (const attack of attacks) {
      const html = markdownToHtml(attack);
      assert.doesNotMatch(html, /<\s*(script|iframe|img|a|style|object|embed)\b/i, attack);
      assert.doesNotMatch(html, /<[a-z][^>]*\son\w+\s*=/i, attack);
    }
  });

  test("colspan survives sanitising but onclick does not", () => {
    const html = markdownToHtml('<table><tr><td colspan="2" onclick="x">merged</td></tr></table>');
    assert.match(html, /colspan="2"/);
    assert.doesNotMatch(html, /onclick/i);
  });
});

describe("text the model formats badly", () => {
  test("emoji are stripped without touching arrows, bullets or currency", () => {
    const html = markdownToHtml("- ✅ Done\n- ⚠️ Gap\n- → next · • item · €100 · ✓ ok");
    assert.doesNotMatch(html, /\p{Extended_Pictographic}/u);
    for (const keep of ["→", "•", "€", "✓"]) {
      assert.ok(html.includes(keep), `${keep} is legitimate content and must survive`);
    }
  });

  test("emoji removal does not flatten indentation inside diagrams", () => {
    // An early version collapsed runs of spaces document-wide to clean up
    // after the emoji, which destroyed Mermaid indentation.
    const html = markdownToHtml("```mermaid\nflowchart TD\n    Start([Go]) --> Next\n```");
    assert.match(preBlocks(html)[0], /\n {4}Start/);
  });

  test("named LaTeX commands are rendered, currency is left alone", () => {
    const html = markdownToHtml("Path A $\\rightarrow$ B, cost $225,600 and $120/hour");
    assert.ok(html.includes("→"));
    assert.ok(html.includes("$225,600"), "a general $...$ math rule would eat the cost table");
    assert.ok(html.includes("$120/hour"));
  });

  test("backslash-escaped markdown punctuation is unescaped", () => {
    const html = markdownToHtml("Command: \\*phase-b and \\_id\\_");
    assert.ok(html.includes("*phase-b"));
    assert.equal(html.includes("\\*"), false);
  });
});
