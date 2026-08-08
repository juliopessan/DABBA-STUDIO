import { runWithFallback } from "./openrouter.js";

export interface RunRequest {
  systemPrompt: string;
  command: string;
  input?: string;
  // The personas were written for a human-in-the-loop workflow (they ask
  // clarifying questions and wait for confirmation). In the automated
  // pipeline there is no human to answer — without this notice the model
  // (especially the small/free ones) degenerates into "chatting" about the
  // previous phase instead of executing its own ("Answer: Yes, we proceed
  // with…"), observed in a real run chaining all 5 phases.
  autoMode?: boolean;
}

const AUTO_MODE_PREFIX = `AUTOMATED PIPELINE MODE — there is no human available to answer questions, give confirmations or clarify anything. Never ask, never request confirmation, never write phrases like "confirm whether you want…" or "awaiting your reply". Execute the requested command and produce the complete artifact directly in this response, adopting reasonable assumptions (and documenting them) wherever you would normally interview a human.

---

`;

// The model mirrors the language of its input by default, so a Portuguese or
// Spanish RFP produced a mixed-language report even with English personas.
// Every artifact is a client deliverable, so the output language is pinned
// here — independent of the language the source document happens to be in.
const LANGUAGE_RULE = `OUTPUT LANGUAGE — write every artifact in English (EN-US), regardless of the language of the RFP, the attached documents or any earlier phase. Translate quoted source material into English rather than reproducing it verbatim in another language.

---

`;

// Formatting defects observed in real runs across every phase, so the rule is
// pinned globally here rather than repeated in each persona file. Emoji status
// markers (✅/⚠️) were the most pervasive: they read as informal in a document
// that goes to a client, and the model reaches for them by default in
// checklists and validation sections. The escaping and LaTeX clauses cover
// literal "\\*estimate" and "$\\rightarrow$" leaking into the rendered HTML,
// which has no LaTeX renderer.
const FORMATTING_RULE = `OUTPUT FORMATTING — these are client-facing deliverables rendered as HTML.

- Never use emoji or decorative symbols (no ✅, ⚠️, ❌, 📌, 🚀 and so on). State status in words instead: "Validated", "Gap", "Blocked", "Covered".
- Never use LaTeX or math notation ($\\rightarrow$, \\(x\\)). Write the plain character: an arrow is "->" or "→".
- Do not backslash-escape markdown characters (write *estimate, not \\*estimate).
- Produce only the section the current command asks for. Re-emitting a section that another command owns puts the same heading twice in the final document with two different sets of numbers.

---

`;

export interface RunResult {
  mode: "live" | "dry-run";
  provider?: "anthropic" | "openrouter";
  model?: string;
  output: string;
  fallbackAttempts?: { model: string; status: number }[];
}

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

function buildUserMessage(command: string, input?: string): string {
  return input ? `Command: ${command}\n\n${input}` : `Command: ${command}`;
}

async function runAnthropic(apiKey: string, systemPrompt: string, userMessage: string): Promise<RunResult> {
  const model = process.env.DABBA_LLM_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic error (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { content: { type: string; text?: string }[] };
  const output = data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");

  return { mode: "live", provider: "anthropic", model, output };
}

async function runOpenRouter(apiKey: string, systemPrompt: string, userMessage: string): Promise<RunResult> {
  const { model, output, attempts } = await runWithFallback(apiKey, systemPrompt, userMessage);
  return {
    mode: "live",
    provider: "openrouter",
    model,
    output,
    fallbackAttempts: attempts.map(({ model, status }) => ({ model, status })),
  };
}

export async function runAgentCommand(req: RunRequest): Promise<RunResult> {
  const userMessage = buildUserMessage(req.command, req.input);
  // The language and formatting rules apply to every call, not just pipeline
  // runs — a single command executed by hand produces a client-facing artifact
  // too.
  const systemPrompt =
    LANGUAGE_RULE + FORMATTING_RULE + (req.autoMode ? AUTO_MODE_PREFIX + req.systemPrompt : req.systemPrompt);
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.DABBA_LLM_API_KEY;
  const provider = process.env.DABBA_LLM_PROVIDER ?? (openRouterKey ? "openrouter" : anthropicKey ? "anthropic" : undefined);

  if (provider === "openrouter" && openRouterKey) {
    return runOpenRouter(openRouterKey, systemPrompt, userMessage);
  }
  if (provider === "anthropic" && anthropicKey) {
    return runAnthropic(anthropicKey, systemPrompt, userMessage);
  }

  return {
    mode: "dry-run",
    output: [
      "Nenhum provider LLM configurado (OPENROUTER_API_KEY ou DABBA_LLM_API_KEY) — nenhuma chamada de API foi feita.",
      "Prompt que seria enviado:",
      `--- system ---\n${systemPrompt}`,
      `--- user ---\n${userMessage}`,
    ].join("\n\n"),
  };
}
