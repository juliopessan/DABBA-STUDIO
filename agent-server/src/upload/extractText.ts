import mammoth from "mammoth";
// pdf-parse's ESM default export runs a debug self-test when imported at
// top-level in some bundlers; importing the lib entry directly avoids it.
import pdfParse from "pdf-parse/lib/pdf-parse.js";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export type SupportedExtension = "pdf" | "docx" | "html" | "htm" | "txt" | "md";

const SUPPORTED: SupportedExtension[] = ["pdf", "docx", "html", "htm", "txt", "md"];

export function isSupportedExtension(ext: string): ext is SupportedExtension {
  return (SUPPORTED as string[]).includes(ext.toLowerCase());
}

export async function extractText(buffer: Buffer, extension: string): Promise<string> {
  const ext = extension.toLowerCase();

  if (ext === "pdf") {
    const { text } = await pdfParse(buffer);
    return text.trim();
  }

  if (ext === "docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    return value.trim();
  }

  if (ext === "html" || ext === "htm") {
    return stripHtml(buffer.toString("utf-8"));
  }

  if (ext === "txt" || ext === "md") {
    return buffer.toString("utf-8").trim();
  }

  throw new Error(
    `Unsupported format .${ext}. Use PDF, DOCX, HTML or TXT/MD (legacy .doc files must be converted to .docx).`
  );
}
