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

// Agentes frequentemente envolvem a resposta inteira num único bloco
// ```markdown ... ```, às vezes com um preâmbulo ("Segue o PRD:") antes ou
// uma nota solta ("Se quiser ajustar...") depois. Sem isso, o parser
// trataria o documento inteiro como código literal.
//
// Só desembrulha quando há EXATAMENTE um par de fences no documento inteiro
// (a resposta inteira = 1 bloco). Documentos com múltiplos blocos de código
// legítimos (ex: vários diagramas ```mermaid na fase de arquitetura) têm
// mais de 2 marcadores — nesse caso cada fence deve ser tratado
// individualmente pelo parser, não descartado como se fosse um wrapper
// único (fazer isso quebra o pareamento de todos os fences internos).
function unwrapOuterCodeFence(markdown: string): string {
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

// Conversor minimalista de markdown → HTML: cobre headers, negrito/itálico,
// código inline/bloco, listas e parágrafos — suficiente para o output
// tipicamente estruturado dos agentes, sem puxar uma lib externa.
export function markdownToHtml(markdown: string): string {
  const lines = unwrapOuterCodeFence(markdown).split("\n");
  const html: string[] = [];
  let inList = false;
  let inCodeBlock = false;
  let paragraph: string[] = [];

  function flushParagraph() {
    if (paragraph.length) {
      html.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  }

  function closeList() {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        html.push("</code></pre>");
        inCodeBlock = false;
      } else {
        flushParagraph();
        closeList();
        html.push("<pre><code>");
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      html.push(escapeHtml(rawLine) + "\n");
      continue;
    }

    if (/^-{3,}$/.test(line.trim())) {
      flushParagraph();
      closeList();
      html.push("<hr>");
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length + 1; // h2..h5, h1 reservado pro título da fase
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const listItem = line.match(/^[-*]\s+(.*)$/);
    if (listItem) {
      flushParagraph();
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inline(listItem[1])}</li>`);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      closeList();
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  closeList();
  if (inCodeBlock) html.push("</code></pre>");

  return html.join("\n");
}
