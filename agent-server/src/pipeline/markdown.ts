function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  return out;
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
// wrapper). None of these personas ever intend a bare/markdown/md-tagged
// fence as real content — genuine code is always tagged with something
// specific (```mermaid being the only case these documents use) — so every
// fence block whose info string is empty, "markdown" or "md" is a false
// wrapper: strip just its two boundary lines and leave the content in place
// to be re-parsed as ordinary markdown. That re-parse is what lets a
// wrapper's own nested ```mermaid block (previously swallowed as literal
// text because CommonMark fences don't actually nest) surface as a proper,
// separately-fenced top-level block afterwards.
//
// Runs to a fixed point (bounded) because unwrapping one false wrapper can
// expose another one that was previously buried inside it.
export function unwrapOuterCodeFence(markdown: string): string {
  let lines = markdown.split("\n");

  for (let pass = 0; pass < 5; pass++) {
    const blocks = findFenceBlocks(lines);
    const wrapper = blocks.find((b) => /^(markdown|md)?$/i.test(b.info));
    if (!wrapper) break;

    lines = [
      ...lines.slice(0, wrapper.openIndex),
      ...lines.slice(wrapper.openIndex + 1, wrapper.closeIndex),
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
  const lines = unwrapOuterCodeFence(markdown).split("\n");
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
