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

// Agents often wrap the whole response in a single ```markdown … ``` block,
// sometimes with a preamble ("Here is the PRD:") before it or a stray note
// ("Let me know if you want changes…") after. Without this the parser would
// treat the entire document as literal code.
//
// Only unwrap when there is EXACTLY one fence pair in the whole document (the
// entire response = 1 block). Documents with several legitimate code blocks
// (e.g. multiple ```mermaid diagrams in the architecture phase) have more
// than 2 markers — there each fence must be handled individually by the
// parser, not discarded as if it were a single wrapper (doing so breaks the
// pairing of every inner fence).
export function unwrapOuterCodeFence(markdown: string): string {
  const fenceLine = /^\s*```[a-z]*\s*$/im;
  const lines = markdown.split("\n");
  const fenceIndexes = lines.reduce<number[]>((acc, line, i) => {
    if (fenceLine.test(line)) acc.push(i);
    return acc;
  }, []);

  if (fenceIndexes.length !== 2) return markdown;

  const [first, last] = fenceIndexes;
  const inner = lines.slice(first + 1, last).join("\n");

  return inner.length > markdown.length * 0.5 ? inner : markdown;
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
      if (inCodeBlock) {
        html.push("</code></pre>");
        inCodeBlock = false;
      } else {
        flushParagraph();
        closeAllLists();
        html.push("<pre><code>");
        inCodeBlock = true;
      }
      i++;
      continue;
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
