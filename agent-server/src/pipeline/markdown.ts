function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// The personas are instructed not to emit emoji (see FORMATTING_RULE in
// llm/provider.ts), but a free model reaches for ✅/⚠️ in checklists often
// enough that the rendered deliverable needs a deterministic guarantee, not
// just a prompt asking nicely. Extended_Pictographic is the Unicode property
// that means "emoji pictograph" precisely — it matches ✅⚠️📌❌🚀 while leaving
// →, ✓, •, — and currency symbols alone, all of which appear legitimately in
// these documents. FE0F (variation selector) and the skin-tone modifiers are
// stripped alongside so no orphan combining marks survive.
// Each run also eats the spaces immediately trailing the emoji, so "✅ Done"
// becomes "Done" rather than " Done" — a leading space would break the
// heading and list patterns below, which anchor on the start of the line.
// Only the adjacent whitespace is touched: collapsing runs of spaces
// document-wide would flatten the indentation inside mermaid blocks.
const EMOJI = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}️‍]+[ \t]*/gu;

function stripEmoji(text: string): string {
  return text.replace(EMOJI, "");
}

// Models sometimes reach for LaTeX in prose (mostly inside flowchart labels).
// The report has no math renderer, so "$\rightarrow$" would show verbatim.
// Only these named commands are translated — deliberately NOT a general
// "$...$ is math" rule, which would corrupt the cost tables ("$225,600 ...
// $120/hour" would match as a math span and vanish).
const LATEX_LITERALS: Record<string, string> = {
  rightarrow: "→", to: "→", leftarrow: "←", leftrightarrow: "↔",
  Rightarrow: "⇒", Leftarrow: "⇐", times: "×", div: "÷",
  leq: "≤", geq: "≥", neq: "≠", approx: "≈", pm: "±",
};

function replaceLatex(text: string): string {
  return text.replace(/\$\\([a-zA-Z]+)\$/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(LATEX_LITERALS, name) ? LATEX_LITERALS[name] : whole
  );
}

function inline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Unescape backslash-escaped markdown punctuation LAST, after the emphasis
  // passes have run — a model writing "\*estimate" means the literal text
  // "*estimate" (it is escaping a command name), and doing this earlier would
  // hand that bare asterisk to the emphasis regex instead.
  out = out.replace(/\\([\\`*_{}\[\]()#+\-.!~|])/g, "$1");
  return out;
}

// Some models occasionally hallucinate a bogus closing marker that LOOKS
// like a fence but isn't one — e.g. a stray ```<next_steps> or ```<status>
// line with an angle-bracket "tag" as its info string. No legitimate fence
// info string in these documents (or in CommonMark generally) is wrapped in
// angle brackets — real ones are bare words (mermaid, table, confirmation).
// Left in place, one of these gets treated as a real (if unintentional)
// fence opener and its matching closer often turns out to be the closing
// ``` of a genuine, unrelated ```mermaid block nested a few lines later —
// fences don't actually nest, so that mismatch swallows the diagram AND
// everything up to it as literal text (measured in production: over 3000
// characters of real headings and tables absorbed into one <pre> block).
// Since these lines are never valid content on their own, the safe fix is to
// drop them before fence-pairing ever runs, rather than try to pair them.
const FAKE_TAG_FENCE = /^```\s*<\/?[\w-]+>\s*$/;

function stripFakeTagFences(lines: string[]): string[] {
  return lines.filter((l) => !FAKE_TAG_FENCE.test(l.trim()));
}

// A fence's info string (the text right after the opening backticks, e.g.
// "mermaid" in ```mermaid) is what distinguishes an opener from a closer per
// CommonMark: a closing fence must carry NO info string. A line like
// ```mermaid appearing while already inside a fence is therefore never a
// closer — it's literal content of whatever fence is currently open. Pairing
// fences any other way (e.g. "every ``` line toggles code mode") misreads
// that line as closing the wrong block and silently reshuffles which spans
// of the document end up as code vs. prose.
interface FenceBlock {
  openIndex: number;
  closeIndex: number;
  info: string;
}

function findFenceBlocks(lines: string[]): FenceBlock[] {
  const blocks: FenceBlock[] = [];
  let openIndex = -1;
  let openInfo = "";
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith("```")) continue;
    const info = trimmed.slice(3).trim();
    if (openIndex === -1) {
      openIndex = i;
      openInfo = info;
    } else if (info === "") {
      blocks.push({ openIndex, closeIndex: i, info: openInfo });
      openIndex = -1;
      openInfo = "";
    }
    // else: non-empty info while already inside a fence — not a valid
    // closer, leave it as literal content of the open block.
  }
  return blocks;
}

// Agents routinely wrap part or all of a response in a bare ``` or
// ```markdown block, sometimes several times in the same document (each
// command in a chained phase like backlog's *breakdown → *estimate →
// *staffing produces its own response, and each one may carry its own false
// wrapper). "mermaid" is the ONLY fence language these personas ever
// intend as genuine code/diagram source (the report has no client-side
// mermaid.js — a mermaid fence is deliberately displayed as source text, not
// rendered) — so this is an allowlist, not a blocklist: any fence whose info
// string is not exactly "mermaid" is a false wrapper, whatever it says. That
// covers the obvious cases (empty, "markdown", "md") but also a real failure
// mode found in production reports: a model tagging a genuine GFM table as
// ```table or ```confirmation, which must become a real <table>, not a
// literal-text code box. Since "mermaid" is the only fence this app's
// personas ever emit on purpose, anything else is presumptively noise: strip
// just its two boundary lines and leave the content in place to be
// re-parsed as ordinary markdown (tables become tables, prose becomes
// prose). That re-parse is also what lets a wrapper's own nested ```mermaid
// block (previously swallowed as literal text because CommonMark fences
// don't actually nest) surface as a proper, separately-fenced top-level
// block afterwards.
//
// Runs to a fixed point (bounded) because unwrapping one false wrapper can
// expose another one that was previously buried inside it.
export function unwrapOuterCodeFence(markdown: string): string {
  let lines = stripFakeTagFences(markdown.split("\n"));

  for (let pass = 0; pass < 5; pass++) {
    const blocks = findFenceBlocks(lines);
    // "table" is not a real Mermaid diagram type — a ```mermaid block whose
    // first line is literally "table" is a model mislabeling a genuine GFM
    // table (found in production, e.g. a "Build vs Buy Decisions" table
    // emitted this way), not an actual diagram. Unwrap it like any other
    // false wrapper — plus the "table" marker line itself, which carries no
    // useful information — so the pipe rows re-parse as a real <table>
    // instead of rendering as literal text in a code box.
    const wrapper = blocks.find((b) => {
      if (!/^mermaid$/i.test(b.info)) return true;
      return lines[b.openIndex + 1]?.trim().toLowerCase() === "table";
    });
    if (!wrapper) break;
    const mislabeledTable = /^mermaid$/i.test(wrapper.info);

    lines = [
      ...lines.slice(0, wrapper.openIndex),
      ...lines.slice(wrapper.openIndex + 1 + (mislabeledTable ? 1 : 0), wrapper.closeIndex),
      ...lines.slice(wrapper.closeIndex + 1),
    ];
  }

  return lines.join("\n");
}

const UNORDERED_ITEM = /^(\s*)[-*]\s+(.*)$/;
const ORDERED_ITEM = /^(\s*)\d+[.)]\s+(.*)$/;
const TABLE_ROW = /^\s*\|(.+)\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?[\s:-]+\|[\s:|-]+\|?\s*$/;

function splitTableRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

interface ListFrame {
  indent: number;
  ordered: boolean;
  liOpen: boolean;
}

// Dependency-free markdown → HTML converter: headers, bold/italic/inline
// code, code blocks, GFM tables, ordered and unordered lists with
// indentation-based nesting, and paragraphs.
export function markdownToHtml(markdown: string): string {
  // Both passes run on the whole document, before parsing and before the fence
  // logic — an emoji sitting at the start of a heading or list item would
  // otherwise shift the line and defeat the anchored patterns that detect
  // them. Code blocks are cleaned too: a mermaid diagram has no more business
  // carrying an emoji label than the prose does.
  const lines = replaceLatex(stripEmoji(unwrapOuterCodeFence(markdown))).split("\n");
  const html: string[] = [];
  let inCodeBlock = false;
  let paragraph: string[] = [];
  const listStack: ListFrame[] = [];

  function flushParagraph() {
    if (paragraph.length) {
      html.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  }

  // Close list-stack frames down to (but excluding) the target indent — used
  // both on indentation transitions and to close everything at the end.
  function closeListsDeeperThan(indent: number) {
    while (listStack.length && listStack[listStack.length - 1].indent >= indent) {
      const frame = listStack.pop()!;
      if (frame.liOpen) html.push("</li>");
      html.push(frame.ordered ? "</ol>" : "</ul>");
    }
  }

  function closeAllLists() {
    closeListsDeeperThan(-1);
  }

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trimEnd();

    if (line.trim().startsWith("```")) {
      // A closing fence carries no info string (CommonMark) — a line like
      // ```mermaid encountered while already inside a block is not a valid
      // closer, so it falls through to the inCodeBlock branch below and is
      // rendered as literal content instead of prematurely ending the block.
      const fenceInfo = line.trim().slice(3).trim();
      if (inCodeBlock && fenceInfo === "") {
        html.push("</code></pre>");
        inCodeBlock = false;
        i++;
        continue;
      }
      if (!inCodeBlock) {
        flushParagraph();
        closeAllLists();
        html.push("<pre><code>");
        inCodeBlock = true;
        i++;
        continue;
      }
    }
    // A model that forgets to close a ```mermaid fence before continuing
    // with prose otherwise swallows everything after it — headings, real
    // GFM tables, whole sections — as literal code text, until the next
    // accidental bare ``` (measured in production: a whole Effort
    // Estimation + Staffing Plan + Sprint 1 table trio absorbed this way). A
    // bare `---` divider line is a safe implicit-close signal: every persona
    // in this app uses it pervasively as a section separator, and it is
    // never valid standalone Mermaid syntax (a real dash-edge always has
    // node names attached, e.g. "A --- B", never a line of only dashes) —
    // so it cannot appear here as genuine diagram content.
    if (inCodeBlock && /^-{3,}$/.test(line.trim())) {
      html.push("</code></pre>");
      inCodeBlock = false;
    }

    if (inCodeBlock) {
      html.push(escapeHtml(rawLine) + "\n");
      i++;
      continue;
    }

    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      flushParagraph();
      closeAllLists();
      const header = splitTableRow(line);
      // Wrap in a div with its own horizontal scroll — columns such as
      // "Rationale" (Staffing Plan) can hold text long enough to push the
      // table past the document width.
      html.push('<div class="table-wrap"><table><thead><tr>' + header.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>");
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        const cells = splitTableRow(lines[i]);
        html.push("<tr>" + cells.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
        i++;
      }
      html.push("</tbody></table></div>");
      continue;
    }

    if (/^-{3,}$/.test(line.trim())) {
      flushParagraph();
      closeAllLists();
      html.push("<hr>");
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeAllLists();
      const level = heading[1].length + 1; // h2..h5, h1 reserved for the phase title
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    const unordered = line.match(UNORDERED_ITEM);
    const ordered = !unordered ? line.match(ORDERED_ITEM) : null;
    const listMatch = unordered ?? ordered;
    if (listMatch) {
      flushParagraph();
      const indent = listMatch[1].length;
      const content = listMatch[2];
      const isOrdered = !!ordered;

      closeListsDeeperThan(indent + 1);

      const top = listStack[listStack.length - 1];
      if (!top || top.indent < indent) {
        listStack.push({ indent, ordered: isOrdered, liOpen: false });
        html.push(isOrdered ? "<ol>" : "<ul>");
      } else if (top.liOpen) {
        html.push("</li>");
      }

      html.push(`<li>${inline(content)}`);
      listStack[listStack.length - 1].liOpen = true;
      i++;
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      closeAllLists();
      i++;
      continue;
    }

    // Continuation of a list item (an indented line with no marker,
    // logo abaixo de um <li> aberto) — anexa ao mesmo item em vez de
    // become a stray paragraph.
    if (listStack.length && listStack[listStack.length - 1].liOpen && /^\s+\S/.test(rawLine)) {
      html.push(" " + inline(line.trim()));
      i++;
      continue;
    }

    paragraph.push(line.trim());
    i++;
  }

  flushParagraph();
  closeAllLists();
  if (inCodeBlock) html.push("</code></pre>");

  return html.join("\n");
}
